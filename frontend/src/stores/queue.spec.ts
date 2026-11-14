import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http } from '@/api/http';
import type { QueueSnapshot, TaskSummary } from '@/api/types';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { useQueueStore } from './queue';

let server: FakeServer;
beforeEach(() => {
  setActivePinia(createPinia());
  server = fakeServer(http);
});
afterEach(() => server.restore());

function task(id: string, mangaId: string | undefined, status: TaskSummary['status']): TaskSummary {
  return {
    id,
    kind: mangaId ? 'full-manga' : 'rezip',
    mangaId,
    status,
    enqueuedAt: 1,
    ...(status === 'running' ? { startedAt: 2 } : {}),
  };
}

const snapshot = (active: TaskSummary | null, ...pending: TaskSummary[]): QueueSnapshot => ({
  active,
  pending,
});

describe('queue store', () => {
  it('starts empty', () => {
    const q = useQueueStore();
    expect(q.active).toBeNull();
    expect(q.pending).toEqual([]);
    expect(q.count).toBe(0);
    expect(q.activeProgress).toBeNull();
  });

  it('loads GET /api/download/queue', async () => {
    server.reply(200, {
      code: 200,
      data: snapshot(task('t1', 'a', 'running'), task('t2', 'b', 'pending')),
    });
    const q = useQueueStore();
    await q.load();
    expect(server.lastRequest()!.url).toBe('download/queue');
    expect(q.active?.id).toBe('t1');
    expect(q.pending.map((t) => t.id)).toEqual(['t2']);
    expect(q.count).toBe(2);
    expect(q.loaded).toBe(true);
  });

  it('records a load failure without throwing', async () => {
    server.networkError();
    const q = useQueueStore();
    await q.load();
    expect(q.loadError).toMatchObject({ error: 'network-error' });
  });

  it('applySnapshot replaces the whole queue state', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('t1', 'a', 'running'), task('t2', 'b', 'pending')));
    q.applySnapshot(snapshot(null, task('t3', 'c', 'pending')));
    expect(q.active).toBeNull();
    expect(q.pending.map((t) => t.id)).toEqual(['t3']);
  });

  it('isMangaBusy reflects active and pending tasks', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('t1', 'a', 'running'), task('t2', 'b', 'pending')));
    expect(q.isMangaBusy('a')).toBe(true);
    expect(q.isMangaBusy('b')).toBe(true);
    expect(q.isMangaBusy('c')).toBe(false);
  });

  it('tracks progress from download_started without waiting for a progress event', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('t1', 'a', 'running')));
    q.applyStarted({ manga_id: 'a', kind: 'full-manga' });
    expect(q.activeProgress).toEqual({
      mangaId: 'a',
      kind: 'full-manga',
      total: null,
      done: 0,
      failed: 0,
    });
  });

  it('applyProgress updates the counters', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('t1', 'a', 'running')));
    q.applyStarted({ manga_id: 'a', kind: 'redownload' });
    q.applyProgress({ manga_id: 'a', chapters_total: 5, chapters_done: 2, chapters_failed: 1 });
    expect(q.activeProgress).toMatchObject({ kind: 'redownload', total: 5, done: 2, failed: 1 });
  });

  it('applyProgress without a prior start still records progress', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('t1', 'a', 'running')));
    q.applyProgress({ manga_id: 'a', chapters_total: 3, chapters_done: 0, chapters_failed: 0 });
    expect(q.progressOf('a')).toMatchObject({ total: 3, done: 0 });
  });

  it('download_completed clears progress and is kept as lastCompleted', () => {
    const q = useQueueStore();
    q.applyStarted({ manga_id: 'a', kind: 'full-manga' });
    const done = {
      manga_id: 'a',
      kind: 'full-manga' as const,
      status: 'done' as const,
      chapters_total: 3,
      chapters_failed: 0,
      manga: null,
    };
    q.applyCompleted(done);
    expect(q.progressOf('a')).toBeNull();
    expect(q.lastCompleted).toEqual(done);
  });

  it('a snapshot drops progress of manga that are no longer active', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('t1', 'a', 'running')));
    q.applyStarted({ manga_id: 'a', kind: 'full-manga' });
    q.applySnapshot(snapshot(task('t2', 'b', 'running')));
    expect(q.progressOf('a')).toBeNull();
  });

  it('a rezip active task has no manga progress', () => {
    const q = useQueueStore();
    q.applySnapshot(snapshot(task('rz', undefined, 'running')));
    expect(q.activeProgress).toBeNull();
    expect(q.count).toBe(1);
  });

  it('applyScanCompleted stamps the time', () => {
    const q = useQueueStore();
    expect(q.lastScanCompletedAt).toBeNull();
    q.applyScanCompleted();
    expect(typeof q.lastScanCompletedAt).toBe('number');
  });
});
