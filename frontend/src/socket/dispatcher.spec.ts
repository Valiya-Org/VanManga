import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { makeManga } from '@/test/fixtures';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { bindSocketEvents, type SocketLike } from './dispatcher';

/** Minimal in-memory emitter standing in for the socket.io client. */
function fakeSocket() {
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  const socket: SocketLike & { emit(event: string, ...args: unknown[]): void; count(): number } = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler as (...a: unknown[]) => void);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler as (...a: unknown[]) => void);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((h) => h(...args));
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
  return socket;
}

let server: FakeServer;
let socket: ReturnType<typeof fakeSocket>;
let unbind: () => void;

beforeEach(async () => {
  setActivePinia(createPinia());
  server = fakeServer(http);
  socket = fakeSocket();
  unbind = bindSocketEvents(socket);
  // seed the library with one manga
  server.replyOnce(200, { code: 200, data: [makeManga({ manga_id: 'a', updated_at: 1 })] });
  await useLibraryStore().load();
});
afterEach(() => server.restore());

const running = {
  id: 't1',
  kind: 'full-manga' as const,
  mangaId: 'a',
  status: 'running' as const,
  enqueuedAt: 1,
  startedAt: 2,
};

describe('socket dispatcher', () => {
  it('queue_updated → queue snapshot', () => {
    socket.emit('queue_updated', { active: running, pending: [] });
    expect(useQueueStore().active).toEqual(running);
  });

  it('download_started and download_progress → queue progress', () => {
    socket.emit('queue_updated', { active: running, pending: [] });
    socket.emit('download_started', { manga_id: 'a', kind: 'full-manga' });
    expect(useQueueStore().activeProgress).toMatchObject({ total: null, done: 0 });
    socket.emit('download_progress', {
      manga_id: 'a',
      chapters_total: 4,
      chapters_done: 1,
      chapters_failed: 0,
    });
    expect(useQueueStore().activeProgress).toMatchObject({ total: 4, done: 1 });
  });

  it('chapter_completed → library record', () => {
    socket.emit('chapter_completed', {
      manga_id: 'a',
      chapter_index: 2,
      chapter_title: '第2话',
      last_epi: 2,
      last_epi_name: '第2话',
      updated_at: 50,
    });
    expect(useLibraryStore().byId('a')).toMatchObject({ last_epi: 2, updated_at: 50 });
  });

  it('download_completed → library replacement and queue progress cleared', () => {
    socket.emit('download_started', { manga_id: 'a', kind: 'full-manga' });
    const final = makeManga({ manga_id: 'a', completed: true });
    socket.emit('download_completed', {
      manga_id: 'a',
      kind: 'full-manga',
      status: 'done',
      chapters_total: 0,
      chapters_failed: 0,
      manga: final,
    });
    expect(useLibraryStore().byId('a')).toEqual(final);
    expect(useQueueStore().progressOf('a')).toBeNull();
    expect(useQueueStore().lastCompleted?.manga_id).toBe('a');
  });

  it('dmca_alert → removed from library and alert recorded', () => {
    socket.emit('dmca_alert', { manga_id: 'a', manga_name: 'A' });
    expect(useLibraryStore().byId('a')).toBeUndefined();
    expect(useLibraryStore().dmcaAlerts).toHaveLength(1);
  });

  it('scan_completed → stamped and library reloaded', async () => {
    server.replyOnce(200, { code: 200, data: [makeManga({ manga_id: 'b' })] });
    socket.emit('scan_completed');
    expect(useQueueStore().lastScanCompletedAt).not.toBeNull();
    await vi.waitFor(() => expect(useLibraryStore().byId('b')).toBeTruthy());
  });

  it('connect → reloads library and queue', async () => {
    server.reply(200, { code: 200, data: [] });
    server.replyOnce(200, { code: 200, data: [makeManga({ manga_id: 'fresh' })] });
    server.replyOnce(200, { code: 200, data: { active: running, pending: [] } });
    socket.emit('connect');
    await vi.waitFor(() => {
      expect(useLibraryStore().byId('fresh')).toBeTruthy();
      expect(useQueueStore().active?.id).toBe('t1');
    });
    const urls = server.requests.slice(-2).map((r) => r.url);
    expect(urls).toEqual(['library', 'download/queue']);
  });

  it('ignores legacy event names', () => {
    socket.emit('response', { manga_id: 'a', last_epi: 99, last_epi_name: 'x' });
    socket.emit('complete_info', { manga_id: 'a' });
    expect(useLibraryStore().byId('a')!.last_epi).toBe(1);
  });

  it('unbind removes every listener', () => {
    expect(socket.count()).toBe(8);
    unbind();
    expect(socket.count()).toBe(0);
  });
});
