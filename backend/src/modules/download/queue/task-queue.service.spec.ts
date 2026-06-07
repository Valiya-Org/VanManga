import { TaskQueueService } from './task-queue.service';
import { TaskKind } from './task.types';

describe('TaskQueueService', () => {
  let queue: TaskQueueService;

  beforeEach(() => {
    queue = new TaskQueueService();
  });

  it('should enqueue a task and return a handle', () => {
    const executor = jest.fn().mockResolvedValue(undefined);
    queue.registerExecutor(executor);

    const handle = queue.enqueue({
      kind: TaskKind.FULL_MANGA,
      mangaId: 'abc123',
    });

    expect(handle.id).toBeDefined();
    expect(handle.payload.kind).toBe(TaskKind.FULL_MANGA);
    // drain() runs synchronously on enqueue, so first task is already running
    expect(['pending', 'running']).toContain(handle.status);
  });

  it('should reject double executor registration', () => {
    queue.registerExecutor(jest.fn().mockResolvedValue(undefined));
    expect(() =>
      queue.registerExecutor(jest.fn().mockResolvedValue(undefined)),
    ).toThrow('executor already registered');
  });

  it('should process tasks sequentially (concurrency=1)', async () => {
    const order: string[] = [];
    const executor = jest.fn().mockImplementation(async (payload) => {
      order.push(`start-${payload.mangaId}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end-${payload.mangaId}`);
    });
    queue.registerExecutor(executor);

    queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'a' });
    queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'b' });

    // Wait for both tasks to complete
    await new Promise((r) => setTimeout(r, 100));

    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('should report isMangaBusy for active and pending tasks', async () => {
    let resolve: () => void;
    const blocker = new Promise<void>((r) => (resolve = r));
    const executor = jest.fn().mockReturnValue(blocker);
    queue.registerExecutor(executor);

    queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'busy-1' });
    queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'busy-2' });

    // First task is active, second is pending — give drain a tick
    await new Promise((r) => setImmediate(r));

    expect(queue.isMangaBusy('busy-1')).toBe(true);
    expect(queue.isMangaBusy('busy-2')).toBe(true);
    expect(queue.isMangaBusy('not-in-queue')).toBe(false);

    resolve!();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('should not consider REZIP tasks as manga-busy', () => {
    const executor = jest.fn().mockReturnValue(new Promise(() => {}));
    queue.registerExecutor(executor);

    queue.enqueue({ kind: TaskKind.REZIP });

    expect(queue.isMangaBusy('anything')).toBe(false);
  });

  it('should expose pending summaries', () => {
    const executor = jest.fn().mockReturnValue(new Promise(() => {}));
    queue.registerExecutor(executor);

    queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'x' });
    queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId: 'y' });

    const summaries = queue.pendingSummaries();
    // First task already drained → active; second is pending
    expect(summaries.length).toBeGreaterThanOrEqual(1);
    expect(summaries.some((s) => s.mangaId === 'y')).toBe(true);
  });

  it('should handle executor failure gracefully', async () => {
    const executor = jest.fn().mockRejectedValue(new Error('boom'));
    queue.registerExecutor(executor);

    const handle = queue.enqueue({
      kind: TaskKind.FULL_MANGA,
      mangaId: 'fail',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(handle.status).toBe('failed');
    expect(handle.error).toBe('boom');
  });
});
