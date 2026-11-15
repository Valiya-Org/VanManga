import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, renameSync } from 'fs';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { QUEUE_CHANGED } from '../../../common/events/app.events';
import type { AppConfig } from '../../../config/configuration';
import {
  QueueSnapshot,
  RedownloadPayload,
  TaskHandle,
  TaskKind,
  TaskPayload,
  TaskSummaryDto,
} from './task.types';

/** Executor signature: receives the original payload, returns when the
 *  task is finished. Throws on irrecoverable failure. */
export type TaskExecutor = (payload: TaskPayload) => Promise<void>;

/** On-disk shape of queue.json. */
interface PersistedQueue {
  version: 1;
  /** Active task first (if any), then pending tasks in execution order. */
  tasks: Array<{ id: string; payload: TaskPayload; enqueuedAt: number }>;
}

/** FIFO with concurrency=1 — mirrors the original gevent TaskQueue
 *  (utils/TaskQueue.py), which processes one manga at a time.
 *
 *  The queue is persisted to queue.json (next to the library file unless
 *  QUEUE_FILE says otherwise) after every enqueue, start and completion, and
 *  restored on boot: an interrupted running task goes back to the head,
 *  pending ones follow in order. Re-running a full-manga task is safe: it
 *  starts from last_epi + 1 (DownloadOrchestratorService.runFullManga), so
 *  chapters recorded before the interruption are not fetched again. */
@Injectable()
export class TaskQueueService implements OnModuleInit {
  private readonly logger = new Logger(TaskQueueService.name);
  private readonly file: string;
  private readonly pending: TaskHandle[] = [];
  private active: TaskHandle | null = null;
  private executor: TaskExecutor | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly events: EventEmitter2,
  ) {
    this.file = config.get('storage.queueFile', { infer: true });
  }

  /** Restore synchronously so the queue is complete before anything can
   *  enqueue (boot scan, add requests) and dedupe against it. */
  onModuleInit(): void {
    const restored = this.readPersisted();
    if (restored.length === 0) return;
    // Restored tasks go ahead of anything enqueued during module init.
    this.pending.unshift(...restored);
    this.logger.log(`Restored ${restored.length} task(s) from ${this.file}`);
    void this.drain();
  }

  /** Bound by DownloadOrchestratorService at module init.
   *  Decouples the queue from the orchestrator (no circular DI). */
  registerExecutor(executor: TaskExecutor): void {
    if (this.executor) {
      throw new Error('TaskQueueService executor already registered');
    }
    this.executor = executor;
    void this.drain();
  }

  /** Queue a task, or return the existing handle it duplicates:
   *  - full-manga / rezip: an identical task already pending or running
   *  - redownload: a pending redownload of the same manga, into which the
   *    new chapters are merged (by url) */
  enqueue(payload: TaskPayload): TaskHandle {
    const duplicate = this.findDuplicate(payload);
    if (duplicate) {
      if (payload.kind === TaskKind.REDOWNLOAD) {
        this.mergeChapters(duplicate.payload as RedownloadPayload, payload);
        this.changed();
      }
      this.logger.log(`De-duplicated ${this.describe(duplicate)}`);
      return duplicate;
    }

    const handle: TaskHandle = {
      id: randomUUID(),
      payload,
      status: 'pending',
      enqueuedAt: Date.now(),
    };
    this.pending.push(handle);
    this.logger.log(`Enqueued ${this.describe(handle)} (queue size=${this.pending.length})`);
    this.changed();
    void this.drain();
    return handle;
  }

  /** Synchronously check whether a manga ID is in-flight or queued.
   *  Used by the delete routes to refuse deleting a busy manga. */
  isMangaBusy(mangaId: string): boolean {
    if (this.activeMangaId() === mangaId) return true;
    return this.pending.some((t) => this.payloadMangaId(t.payload) === mangaId);
  }

  activeMangaId(): string | null {
    if (!this.active) return null;
    return this.payloadMangaId(this.active.payload);
  }

  pendingSummaries(): TaskSummaryDto[] {
    return this.pending.map((t) => this.summarise(t));
  }

  activeSummary(): TaskSummaryDto | null {
    return this.active ? this.summarise(this.active) : null;
  }

  snapshot(): QueueSnapshot {
    return { active: this.activeSummary(), pending: this.pendingSummaries() };
  }

  /** Resolves once every scheduled write has reached the disk. */
  flushPersistence(): Promise<void> {
    return this.writeChain;
  }

  private async drain(): Promise<void> {
    if (this.active || !this.executor) return;
    const next = this.pending.shift();
    if (!next) return;

    this.active = next;
    next.status = 'running';
    next.startedAt = Date.now();
    this.logger.log(`Started ${this.describe(next)}`);
    this.changed();

    try {
      await this.executor(next.payload);
      next.status = 'done';
    } catch (err) {
      next.status = 'failed';
      next.error = (err as Error).message;
      this.logger.error(`${this.describe(next)} failed: ${next.error}`, (err as Error).stack);
    } finally {
      next.finishedAt = Date.now();
      this.active = null;
      this.changed();
      // Start the next task on a fresh tick so enqueue() callers resolve first.
      setImmediate(() => void this.drain());
    }
  }

  private findDuplicate(payload: TaskPayload): TaskHandle | undefined {
    const same = (t: TaskHandle) => this.sameTask(t.payload, payload);

    if (payload.kind === TaskKind.REDOWNLOAD) {
      // A running redownload has fixed its chapter list; queue a new one.
      return this.pending.find(same);
    }
    if (this.active && same(this.active)) return this.active;
    return this.pending.find(same);
  }

  /** Same kind for the same manga (rezip has none, so all rezips match). */
  private sameTask(a: TaskPayload, b: TaskPayload): boolean {
    return a.kind === b.kind && this.payloadMangaId(a) === this.payloadMangaId(b);
  }

  private mergeChapters(target: RedownloadPayload, extra: RedownloadPayload): void {
    const known = new Set(target.chapters.map((c) => c.url));
    for (const chapter of extra.chapters) {
      if (!known.has(chapter.url)) {
        target.chapters.push(chapter);
        known.add(chapter.url);
      }
    }
  }

  /** Persist and broadcast the new state. */
  private changed(): void {
    this.persist();
    this.events.emit(QUEUE_CHANGED, this.snapshot());
  }

  // ------------------------------------------------------------ persistence

  private persist(): void {
    this.writeChain = this.writeChain
      .then(() => this.writeAtomic())
      .catch((err: unknown) =>
        this.logger.error(`Could not write ${this.file}: ${(err as Error).message}`),
      );
  }

  /** Serialised through writeChain; each write captures the state at the
   *  moment it runs, so the last write always reflects the latest state. */
  private async writeAtomic(): Promise<void> {
    const tasks = [...(this.active ? [this.active] : []), ...this.pending].map((t) => ({
      id: t.id,
      payload: t.payload,
      enqueuedAt: t.enqueuedAt,
    }));
    const body: PersistedQueue = { version: 1, tasks };
    const tmp = `${this.file}.tmp`;
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(body, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }

  /** A missing file is an empty queue. A corrupt one is renamed to
   *  queue.json.corrupt-<unix-seconds> (kept as evidence) and ignored:
   *  unlike the library, losing the queue only loses work the next boot
   *  scan re-queues anyway. Entries of the wrong shape are dropped, and
   *  duplicates (same id, or the same task as an earlier entry) are
   *  folded into the first, each with a log line. */
  private readPersisted(): TaskHandle[] {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Cannot read ${this.file}: ${(err as Error).message}; starting with an empty queue`);
      } else {
        mkdirSync(dirname(this.file), { recursive: true });
      }
      return [];
    }

    let parsed: Partial<PersistedQueue>;
    try {
      parsed = JSON.parse(raw) as Partial<PersistedQueue>;
    } catch (err) {
      // Writes are not fsynced, so a power loss can leave a zero-length
      // file; that lands here too, and the boot scan re-queues the work.
      const kept = `${this.file}.corrupt-${Math.floor(Date.now() / 1000)}`;
      try {
        renameSync(this.file, kept);
      } catch (renameErr) {
        this.logger.error(`Could not move ${this.file} aside: ${(renameErr as Error).message}`);
      }
      this.logger.warn(
        `${this.file} is not valid JSON (${(err as Error).message}); kept as ${kept}, starting with an empty queue`,
      );
      return [];
    }

    const entries: unknown[] = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    const handles: TaskHandle[] = [];
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!this.isValidEntry(entry)) {
        this.logger.warn(`Skipping malformed queue entry: ${JSON.stringify(entry)}`);
        continue;
      }
      if (ids.has(entry.id)) {
        this.logger.warn(`Dropping duplicate queue entry (same id): ${JSON.stringify(entry)}`);
        continue;
      }
      // The same rules as enqueue(): every restored task is pending, so a
      // re-download merges its chapters into an earlier one for that manga.
      const duplicate = handles.find((h) => this.sameTask(h.payload, entry.payload));
      if (duplicate) {
        if (entry.payload.kind === TaskKind.REDOWNLOAD) {
          this.mergeChapters(duplicate.payload as RedownloadPayload, entry.payload);
        }
        this.logger.warn(`Dropping duplicate queue entry: ${JSON.stringify(entry)}`);
        continue;
      }
      ids.add(entry.id);
      handles.push({
        id: entry.id,
        payload: entry.payload,
        status: 'pending',
        enqueuedAt: entry.enqueuedAt,
      });
    }
    return handles;
  }

  private isValidEntry(e: unknown): e is PersistedQueue['tasks'][number] {
    if (!e || typeof e !== 'object') return false;
    const entry = e as Record<string, unknown>;
    return (
      typeof entry.id === 'string' &&
      entry.id !== '' &&
      typeof entry.enqueuedAt === 'number' &&
      Number.isFinite(entry.enqueuedAt) &&
      this.isValidPayload(entry.payload)
    );
  }

  private isValidPayload(p: unknown): p is TaskPayload {
    if (!p || typeof p !== 'object') return false;
    const payload = p as Record<string, unknown>;
    const hasManga = typeof payload.mangaId === 'string' && payload.mangaId !== '';
    switch (payload.kind) {
      case TaskKind.REZIP:
        return true;
      case TaskKind.FULL_MANGA:
        return hasManga;
      case TaskKind.REDOWNLOAD:
        return (
          hasManga &&
          Array.isArray(payload.chapters) &&
          payload.chapters.length > 0 &&
          payload.chapters.every((c) => this.isValidChapter(c))
        );
      default:
        return false;
    }
  }

  private isValidChapter(c: unknown): boolean {
    if (!c || typeof c !== 'object') return false;
    const chapter = c as Record<string, unknown>;
    return (
      Number.isInteger(chapter.index) &&
      typeof chapter.title === 'string' &&
      typeof chapter.url === 'string'
    );
  }

  // ------------------------------------------------------------ helpers

  private payloadMangaId(payload: TaskPayload): string | null {
    return payload.kind === TaskKind.REZIP ? null : payload.mangaId;
  }

  private describe(t: TaskHandle): string {
    const id = this.payloadMangaId(t.payload);
    return id ? `task[${t.payload.kind}, ${id}]` : `task[${t.payload.kind}]`;
  }

  private summarise(t: TaskHandle): TaskSummaryDto {
    return {
      id: t.id,
      kind: t.payload.kind,
      mangaId: this.payloadMangaId(t.payload) ?? undefined,
      status: t.status,
      enqueuedAt: t.enqueuedAt,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
    };
  }
}
