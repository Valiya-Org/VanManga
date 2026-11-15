import { Logger } from '@nestjs/common';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { QUEUE_CHANGED } from '../../../common/events/app.events';
import { TaskQueueService, type TaskExecutor } from './task-queue.service';
import { TaskKind, type TaskPayload } from './task.types';

const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await tick();
};

/** An executor whose tasks finish only when the test says so. */
function controllable() {
  const started: TaskPayload[] = [];
  const resolvers: Array<(err?: Error) => void> = [];
  const executor: TaskExecutor = (payload) =>
    new Promise<void>((resolve, reject) => {
      started.push(payload);
      resolvers.push((err) => (err ? reject(err) : resolve()));
    });
  return {
    executor,
    started,
    finish: (err?: Error) => resolvers.shift()!(err),
  };
}

describe('TaskQueueService', () => {
  let dir: string;
  let file: string;
  let emitter: { emit: jest.Mock };

  const make = (queueFile = file) => {
    emitter = { emit: jest.fn() };
    const q = new TaskQueueService(
      { get: jest.fn(() => queueFile) } as never,
      emitter as never,
    );
    q.onModuleInit();
    return q;
  };
  const onDisk = () =>
    JSON.parse(readFileSync(file, 'utf8')) as {
      version: number;
      tasks: Array<{ id: string; payload: TaskPayload; enqueuedAt: number }>;
    };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vanmanga-queue-'));
    file = join(dir, 'queue.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('execution', () => {
    it('runs tasks one at a time in FIFO order', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' });
      await settle();
      expect(c.started.map((p) => (p as { mangaId: string }).mangaId)).toEqual(['a']);
      c.finish();
      await settle();
      expect(c.started.map((p) => (p as { mangaId: string }).mangaId)).toEqual(['a', 'b']);
      c.finish();
      await settle();
      expect(q.snapshot()).toEqual({ active: null, pending: [] });
    });

    it('rejects a second executor', () => {
      const q = make();
      q.registerExecutor(jest.fn());
      expect(() => q.registerExecutor(jest.fn())).toThrow('executor already registered');
    });

    it('records executor failures and moves on', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      const h = q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' });
      await settle();
      c.finish(new Error('boom'));
      await settle();
      expect(h.status).toBe('failed');
      expect(h.error).toBe('boom');
      expect(q.activeMangaId()).toBe('b');
    });

    it('reports busy manga (active or pending) but never for rezip', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' });
      q.enqueue({ kind: TaskKind.REZIP });
      await settle();
      expect(q.isMangaBusy('a')).toBe(true);
      expect(q.isMangaBusy('b')).toBe(true);
      expect(q.isMangaBusy('c')).toBe(false);
    });

    it('starts tasks enqueued before the executor registers', async () => {
      const q = make();
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      const c = controllable();
      q.registerExecutor(c.executor);
      await settle();
      expect(c.started).toHaveLength(1);
    });

    it('snapshot lists the active task and the pending ones in order', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q.enqueue({ kind: TaskKind.REZIP });
      await settle();
      const s = q.snapshot();
      expect(s.active).toMatchObject({ kind: 'full-manga', mangaId: 'a', status: 'running' });
      expect(s.active!.startedAt).toEqual(expect.any(Number));
      expect(s.pending).toEqual([
        expect.objectContaining({ kind: 'rezip', status: 'pending', mangaId: undefined }),
      ]);
    });
  });

  describe('queue_updated notifications', () => {
    it('emits QUEUE_CHANGED with the snapshot on enqueue, start and finish', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      await settle();
      c.finish();
      await settle();

      const snapshots = emitter.emit.mock.calls
        .filter(([name]) => name === QUEUE_CHANGED)
        .map(([, s]) => s as ReturnType<TaskQueueService['snapshot']>);
      expect(snapshots.length).toBeGreaterThanOrEqual(3);
      // enqueue (pending), start (active), finish (empty)
      expect(snapshots[0].pending.map((t) => t.mangaId)).toEqual(['a']);
      expect(snapshots.some((s) => s.active?.mangaId === 'a' && s.pending.length === 0)).toBe(true);
      expect(snapshots.at(-1)).toEqual({ active: null, pending: [] });
    });
  });

  describe('de-duplication', () => {
    it('returns the existing full-manga task (pending or running) for the same manga', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      const running = q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      const queued = q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' });
      await settle();
      expect(q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' })).toBe(running);
      expect(q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' })).toBe(queued);
      expect(q.snapshot().pending).toHaveLength(1);
    });

    it('does not merge different kinds for the same manga', async () => {
      const q = make();
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q.enqueue({ kind: TaskKind.REDOWNLOAD, mangaId: 'a', chapters: [{ index: 1, title: 't', url: 'u1' }] });
      expect(q.snapshot().pending).toHaveLength(2);
    });

    it('merges a re-download into the pending one for the same manga (by url)', () => {
      const q = make();
      const first = q.enqueue({
        kind: TaskKind.REDOWNLOAD,
        mangaId: 'a',
        chapters: [{ index: 1, title: 't1', url: 'u1' }],
      });
      const second = q.enqueue({
        kind: TaskKind.REDOWNLOAD,
        mangaId: 'a',
        chapters: [
          { index: 1, title: 't1', url: 'u1' },
          { index: 2, title: 't2', url: 'u2' },
        ],
      });
      expect(second).toBe(first);
      expect(first.payload).toMatchObject({
        chapters: [
          { index: 1, url: 'u1' },
          { index: 2, url: 'u2' },
        ],
      });
      expect(q.snapshot().pending).toHaveLength(1);
    });

    it('queues a new re-download when the previous one is already running', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      const running = q.enqueue({ kind: TaskKind.REDOWNLOAD, mangaId: 'a', chapters: [{ index: 1, title: 't', url: 'u1' }] });
      await settle();
      const next = q.enqueue({ kind: TaskKind.REDOWNLOAD, mangaId: 'a', chapters: [{ index: 2, title: 't', url: 'u2' }] });
      expect(next).not.toBe(running);
    });

    it('keeps a single rezip', async () => {
      const q = make();
      const c = controllable();
      q.registerExecutor(c.executor);
      const r = q.enqueue({ kind: TaskKind.REZIP });
      await settle();
      expect(q.enqueue({ kind: TaskKind.REZIP })).toBe(r);
    });
  });

  describe('persistence', () => {
    it('writes queue.json atomically on enqueue, start and completion', async () => {
      const q = make();
      const c = controllable();
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' });
      await q.flushPersistence();
      expect(onDisk().tasks.map((t) => (t.payload as { mangaId: string }).mangaId)).toEqual(['a', 'b']);
      expect(existsSync(`${file}.tmp`)).toBe(false);

      q.registerExecutor(c.executor);
      await settle();
      await q.flushPersistence();
      // running task stays on disk, first
      expect(onDisk().tasks.map((t) => (t.payload as { mangaId: string }).mangaId)).toEqual(['a', 'b']);

      c.finish();
      await settle();
      c.finish();
      await settle();
      await q.flushPersistence();
      expect(onDisk()).toEqual({ version: 1, tasks: [] });
    });

    it('restores queued tasks in order with the interrupted running task at the head', async () => {
      const q1 = make();
      const c1 = controllable();
      q1.registerExecutor(c1.executor);
      const a = q1.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      q1.enqueue({ kind: TaskKind.REDOWNLOAD, mangaId: 'b', chapters: [{ index: 3, title: 't', url: 'u3' }] });
      q1.enqueue({ kind: TaskKind.REZIP });
      await settle();
      await q1.flushPersistence();
      expect(q1.activeMangaId()).toBe('a');
      // process dies here, 'a' never finishes

      const q2 = make();
      expect(q2.snapshot().active).toBeNull();
      expect(q2.snapshot().pending.map((t) => [t.kind, t.mangaId])).toEqual([
        ['full-manga', 'a'],
        ['redownload', 'b'],
        ['rezip', undefined],
      ]);
      expect(q2.snapshot().pending[0].id).toBe(a.id);

      const c2 = controllable();
      q2.registerExecutor(c2.executor);
      await settle();
      expect(c2.started[0]).toEqual({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
      c2.finish();
      await settle();
      expect(c2.started[1]).toEqual({
        kind: TaskKind.REDOWNLOAD,
        mangaId: 'b',
        chapters: [{ index: 3, title: 't', url: 'u3' }],
      });
    });

    it('drains restored tasks when the executor registered first', async () => {
      writeFileSync(
        file,
        JSON.stringify({ version: 1, tasks: [{ id: 'x', payload: { kind: 'full-manga', mangaId: 'a' }, enqueuedAt: 1 }] }),
      );
      emitter = { emit: jest.fn() };
      const q = new TaskQueueService({ get: jest.fn(() => file) } as never, emitter as never);
      const c = controllable();
      q.registerExecutor(c.executor);
      q.onModuleInit();
      await settle();
      expect(c.started).toEqual([{ kind: 'full-manga', mangaId: 'a' }]);
    });

    it('starts empty when queue.json is missing', () => {
      expect(make().snapshot()).toEqual({ active: null, pending: [] });
    });

    it('starts empty (and does not throw) when queue.json is corrupt', () => {
      writeFileSync(file, '{ not json');
      expect(make().snapshot()).toEqual({ active: null, pending: [] });
    });

    it('moves a corrupt queue.json aside as queue.json.corrupt-<unix-seconds>', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_500);
      try {
        writeFileSync(file, '{ not json');
        const q = make();
        const kept = `${file}.corrupt-1800000000`;
        expect(existsSync(kept)).toBe(true);
        expect(readFileSync(kept, 'utf8')).toBe('{ not json');
        // The next write must not clobber the evidence.
        q.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
        await q.flushPersistence();
        expect(readFileSync(kept, 'utf8')).toBe('{ not json');
      } finally {
        jest.restoreAllMocks();
      }
    });

    it('skips malformed entries', () => {
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          tasks: [
            { id: '1', payload: { kind: 'full-manga' }, enqueuedAt: 1 },
            { id: '2', payload: { kind: 'bogus', mangaId: 'x' }, enqueuedAt: 1 },
            { id: '3', payload: { kind: 'redownload', mangaId: 'x', chapters: 'nope' }, enqueuedAt: 1 },
            { id: '4', payload: { kind: 'full-manga', mangaId: 'ok' }, enqueuedAt: 1 },
          ],
        }),
      );
      expect(make().snapshot().pending.map((t) => t.id)).toEqual(['4']);
    });

    it('drops entries whose shape is wrong, with a log line each', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        const ch = { index: 1, title: 't', url: 'u' };
        writeFileSync(
          file,
          JSON.stringify({
            version: 1,
            tasks: [
              { id: '', payload: { kind: 'rezip' }, enqueuedAt: 1 },
              { id: '1', payload: { kind: 'full-manga', mangaId: '' }, enqueuedAt: 1 },
              { id: '2', payload: { kind: 'redownload', mangaId: 'x', chapters: [] }, enqueuedAt: 1 },
              { id: '3', payload: { kind: 'redownload', mangaId: 'x', chapters: [ch, { index: '2', title: 't', url: 'u2' }] }, enqueuedAt: 1 },
              { id: '4', payload: { kind: 'redownload', mangaId: 'x', chapters: [{ index: 1, title: 't' }] }, enqueuedAt: 1 },
              { id: '5', payload: { kind: 'full-manga', mangaId: 'a' }, enqueuedAt: 'yesterday' },
              null,
              { id: '6', payload: { kind: 'redownload', mangaId: 'x', chapters: [ch] }, enqueuedAt: 7 },
            ],
          }),
        );
        const q = make();
        expect(q.snapshot().pending.map((t) => [t.id, t.enqueuedAt])).toEqual([['6', 7]]);
        const dropped = warn.mock.calls.filter(([m]) => String(m).startsWith('Skipping malformed queue entry'));
        expect(dropped).toHaveLength(7);
      } finally {
        warn.mockRestore();
      }
    });

    it('de-duplicates restored entries against each other', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        const c = (n: number) => ({ index: n, title: `t${n}`, url: `u${n}` });
        writeFileSync(
          file,
          JSON.stringify({
            version: 1,
            tasks: [
              { id: '1', payload: { kind: 'full-manga', mangaId: 'a' }, enqueuedAt: 1 },
              { id: '2', payload: { kind: 'redownload', mangaId: 'b', chapters: [c(1), c(2)] }, enqueuedAt: 2 },
              { id: '3', payload: { kind: 'rezip' }, enqueuedAt: 3 },
              { id: '4', payload: { kind: 'full-manga', mangaId: 'a' }, enqueuedAt: 4 },
              { id: '5', payload: { kind: 'redownload', mangaId: 'b', chapters: [c(2), c(3)] }, enqueuedAt: 5 },
              { id: '6', payload: { kind: 'rezip' }, enqueuedAt: 6 },
              { id: '1', payload: { kind: 'full-manga', mangaId: 'z' }, enqueuedAt: 7 },
              { id: '8', payload: { kind: 'full-manga', mangaId: 'b' }, enqueuedAt: 8 },
            ],
          }),
        );
        const q = make();
        expect(q.snapshot().pending.map((t) => [t.id, t.kind, t.mangaId])).toEqual([
          ['1', 'full-manga', 'a'],
          ['2', 'redownload', 'b'],
          ['3', 'rezip', undefined],
          ['8', 'full-manga', 'b'],
        ]);
        expect(warn.mock.calls.filter(([m]) => String(m).startsWith('Dropping duplicate queue entry'))).toHaveLength(4);
      } finally {
        warn.mockRestore();
      }
    });

    it('merges the chapters of duplicate restored re-downloads (by url)', async () => {
      const c = (n: number) => ({ index: n, title: `t${n}`, url: `u${n}` });
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          tasks: [
            { id: '1', payload: { kind: 'redownload', mangaId: 'b', chapters: [c(1), c(2)] }, enqueuedAt: 1 },
            { id: '2', payload: { kind: 'redownload', mangaId: 'b', chapters: [c(2), c(3)] }, enqueuedAt: 2 },
          ],
        }),
      );
      const q = make();
      const ctl = controllable();
      q.registerExecutor(ctl.executor);
      await settle();
      expect(ctl.started).toEqual([
        { kind: TaskKind.REDOWNLOAD, mangaId: 'b', chapters: [c(1), c(2), c(3)] },
      ]);
    });
  });
});
