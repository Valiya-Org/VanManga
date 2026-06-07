import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  TaskHandle,
  TaskKind,
  TaskPayload,
  TaskSummaryDto,
} from './task.types';

/** Executor signature: receives the original payload, returns when the
 *  task is finished. Throws on irrecoverable failure. */
export type TaskExecutor = (payload: TaskPayload) => Promise<void>;

/** In-memory FIFO with concurrency=1 — mirrors the original gevent
 *  TaskQueue (utils/TaskQueue.py) which processes one manga at a time.
 *
 *  Why not Bull/Redis? See Stage-4 design notes: a personal-use scraper
 *  needs sequential single-worker behaviour; persisting tasks across
 *  restarts is not worth the operational cost (boot scanning re-fills
 *  the queue from library state on startup anyway). */
@Injectable()
export class TaskQueueService {
  private readonly logger = new Logger(TaskQueueService.name);
  private readonly pending: TaskHandle[] = [];
  private active: TaskHandle | null = null;
  private executor: TaskExecutor | null = null;

  /** Bound by DownloadOrchestratorService at module init.
   *  Decouples the queue from the orchestrator (no circular DI). */
  registerExecutor(executor: TaskExecutor): void {
    if (this.executor) {
      throw new Error('TaskQueueService executor already registered');
    }
    this.executor = executor;
  }

  enqueue(payload: TaskPayload): TaskHandle {
    const handle: TaskHandle = {
      id: randomUUID(),
      payload,
      status: 'pending',
      enqueuedAt: Date.now(),
    };
    this.pending.push(handle);
    this.logger.log(`Enqueued ${this.describe(handle)} (queue size=${this.pending.length})`);
    void this.drain();
    return handle;
  }

  /** Synchronously check whether a manga ID is in-flight or queued.
   *  Used by LibraryController.deleteManga to refuse delete on busy. */
  isMangaBusy(mangaId: string): boolean {
    if (this.activeMangaId() === mangaId) return true;
    return this.pending.some((t) => this.payloadMangaId(t.payload) === mangaId);
  }

  activeMangaId(): string | null {
    if (!this.active) return null;
    return this.payloadMangaId(this.active.payload);
  }

  /** Read-only snapshot of the queue for /api/download/queue. */
  pendingSummaries(): TaskSummaryDto[] {
    return this.pending.map((t) => this.summarise(t));
  }

  activeSummary(): TaskSummaryDto | null {
    return this.active ? this.summarise(this.active) : null;
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    if (!this.executor) {
      this.logger.warn('drain() called before executor was registered');
      return;
    }
    const next = this.pending.shift();
    if (!next) return;

    this.active = next;
    next.status = 'running';
    next.startedAt = Date.now();
    this.logger.log(`Started ${this.describe(next)}`);

    try {
      await this.executor(next.payload);
      next.status = 'done';
    } catch (err) {
      next.status = 'failed';
      next.error = (err as Error).message;
      this.logger.error(
        `${this.describe(next)} failed: ${next.error}`,
        (err as Error).stack,
      );
    } finally {
      next.finishedAt = Date.now();
      this.active = null;
      // Schedule next drain on the microtask queue so the caller of
      // enqueue() resolves before the next task starts.
      setImmediate(() => void this.drain());
    }
  }

  private payloadMangaId(payload: TaskPayload): string | null {
    return payload.kind === TaskKind.REZIP ? null : payload.mangaId;
  }

  private describe(t: TaskHandle): string {
    const id = this.payloadMangaId(t.payload);
    return id
      ? `task[${t.payload.kind}, ${id}]`
      : `task[${t.payload.kind}]`;
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
