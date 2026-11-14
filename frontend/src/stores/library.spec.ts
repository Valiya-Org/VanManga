import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, setAdminTokenProvider } from '@/api/http';
import { ApiError } from '@/api/errors';
import type { Manga } from '@/api/types';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { makeCandidate, makeManga } from '@/test/fixtures';
import { useLibraryStore } from './library';
import { useSessionStore } from './session';

let server: FakeServer;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  server = fakeServer(http);
});
afterEach(() => {
  server.restore();
  setAdminTokenProvider(null);
});

const ok = (data: unknown) => ({ code: 200, data });

async function loaded(items = [makeManga({ manga_id: 'a' })]) {
  server.replyOnce(200, ok(items));
  const lib = useLibraryStore();
  await lib.load();
  return lib;
}

describe('library store · load, sort, filter', () => {
  it('loads and sorts by updated_at desc', async () => {
    const lib = await loaded([
      makeManga({ manga_id: 'old', updated_at: 100 }),
      makeManga({ manga_id: 'new', updated_at: 300 }),
      makeManga({ manga_id: 'mid', updated_at: 200 }),
    ]);
    expect(lib.loaded).toBe(true);
    expect(lib.sorted.map((m) => m.manga_id)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks updated_at ties by add_date desc', async () => {
    const lib = await loaded([
      makeManga({ manga_id: 'x', updated_at: 5, add_date: 1 }),
      makeManga({ manga_id: 'y', updated_at: 5, add_date: 2 }),
    ]);
    expect(lib.sorted.map((m) => m.manga_id)).toEqual(['y', 'x']);
  });

  it('falls back to add_date when a record has no updated_at', async () => {
    const legacy: Partial<Manga> = makeManga({ manga_id: 'legacy', add_date: 250 });
    delete legacy.updated_at;
    const lib = await loaded([
      makeManga({ manga_id: 'old', updated_at: 100, add_date: 1 }),
      legacy as Manga,
      makeManga({ manga_id: 'new', updated_at: 300, add_date: 1 }),
    ]);
    expect(lib.sorted.map((m) => m.manga_id)).toEqual(['new', 'legacy', 'old']);
  });

  it('keeps unknown extra fields from old records', async () => {
    const legacy = { ...makeManga({ manga_id: 'z' }), some_old_field: 'kept' };
    const lib = await loaded([legacy]);
    expect(lib.byId('z')!.some_old_field).toBe('kept');
  });

  it('filters by name, artist or id, case-insensitively and trimmed', async () => {
    const lib = await loaded([
      makeManga({ manga_id: 'id-one', manga_name: 'One Piece', artist_name: 'Oda' }),
      makeManga({ manga_id: 'id-two', manga_name: '进击的巨人', artist_name: '谏山创' }),
    ]);
    lib.filter = '  piece ';
    expect(lib.visible.map((m) => m.manga_id)).toEqual(['id-one']);
    lib.filter = '谏山';
    expect(lib.visible.map((m) => m.manga_id)).toEqual(['id-two']);
    lib.filter = 'ID-TWO';
    expect(lib.visible.map((m) => m.manga_id)).toEqual(['id-two']);
    lib.filter = '';
    expect(lib.visible).toHaveLength(2);
  });

  it('records a load failure without throwing', async () => {
    server.replyOnce(500, { code: 500, error: 'internal-error' });
    const lib = useLibraryStore();
    await expect(lib.load()).resolves.toBeUndefined();
    expect(lib.loadError).toMatchObject({ error: 'internal-error' });
    expect(lib.loaded).toBe(false);
  });
});

describe('library store · load vs live updates', () => {
  const completed = (manga: ReturnType<typeof makeManga> | null, id = 'a') => ({
    manga_id: id,
    kind: 'full-manga' as const,
    status: 'done' as const,
    chapters_total: 1,
    chapters_failed: 0,
    manga,
  });

  it('a removal during a load does not reappear from the snapshot', async () => {
    const lib = await loaded([makeManga({ manga_id: 'a' }), makeManga({ manga_id: 'b' })]);
    const slow = server.replyDeferred();
    const pending = lib.load();
    await slow.received;

    lib.applyDmcaAlert({ manga_id: 'a', manga_name: 'A' });
    slow.resolve(200, ok([makeManga({ manga_id: 'a' }), makeManga({ manga_id: 'b' })]));
    await pending;

    expect(lib.byId('a')).toBeUndefined();
    expect(lib.byId('b')).toBeTruthy();
  });

  it('a download_completed record during a load is not replaced by the older snapshot', async () => {
    const lib = await loaded([makeManga({ manga_id: 'a', last_epi: 1 })]);
    const slow = server.replyDeferred();
    const pending = lib.load();
    await slow.received;

    const fresh = makeManga({ manga_id: 'a', last_epi: 9, completed: true });
    lib.applyDownloadCompleted(completed(fresh));
    slow.resolve(200, ok([makeManga({ manga_id: 'a', last_epi: 1 }), makeManga({ manga_id: 'b' })]));
    await pending;

    expect(lib.byId('a')).toEqual(fresh);
    expect(lib.byId('b')).toBeTruthy();
  });

  it('a chapter_completed patch during a load survives the snapshot', async () => {
    const lib = useLibraryStore();
    const slow = server.replyDeferred();
    const pending = lib.load();
    await slow.received;

    lib.applyChapterCompleted({
      manga_id: 'a',
      chapter_index: 5,
      chapter_title: '5',
      last_epi: 5,
      last_epi_name: '5',
      updated_at: 999,
    });
    slow.resolve(200, ok([makeManga({ manga_id: 'a', last_epi: 2, newest_epi: 'from-server' })]));
    await pending;

    expect(lib.byId('a')).toMatchObject({ last_epi: 5, updated_at: 999, newest_epi: 'from-server' });
  });

  it('an upsert during a load of a manga missing from the snapshot is kept', async () => {
    const lib = useLibraryStore();
    const slow = server.replyDeferred();
    const pending = lib.load();
    await slow.received;

    lib.applyDownloadCompleted(completed(makeManga({ manga_id: 'new' }), 'new'));
    slow.resolve(200, ok([makeManga({ manga_id: 'a' })]));
    await pending;

    expect(lib.items.map((m) => m.manga_id)).toEqual(['a', 'new']);
  });

  it('changes made before the load started do not override it', async () => {
    const lib = await loaded([makeManga({ manga_id: 'a', last_epi: 1 })]);
    lib.applyDownloadCompleted(completed(makeManga({ manga_id: 'a', last_epi: 3 })));
    server.replyOnce(200, ok([makeManga({ manga_id: 'a', last_epi: 4 })]));
    await lib.load();
    expect(lib.byId('a')!.last_epi).toBe(4);
  });

  it('overlapping loads: only the latest response is applied, loading stays true until both end', async () => {
    const lib = useLibraryStore();
    const first = server.replyDeferred();
    const second = server.replyDeferred();
    const p1 = lib.load();
    const p2 = lib.load();
    await Promise.all([first.received, second.received]);
    expect(lib.loading).toBe(true);

    second.resolve(200, ok([makeManga({ manga_id: 'newer' })]));
    await p2;
    expect(lib.loading).toBe(true);
    expect(lib.items.map((m) => m.manga_id)).toEqual(['newer']);

    first.resolve(200, ok([makeManga({ manga_id: 'older' })]));
    await p1;
    expect(lib.loading).toBe(false);
    expect(lib.items.map((m) => m.manga_id)).toEqual(['newer']);
  });

  it('a stale failure does not set loadError over a newer success', async () => {
    const lib = useLibraryStore();
    const first = server.replyDeferred();
    const second = server.replyDeferred();
    const p1 = lib.load();
    const p2 = lib.load();
    await Promise.all([first.received, second.received]);
    second.resolve(200, ok([]));
    first.networkError();
    await Promise.all([p1, p2]);
    expect(lib.loadError).toBeNull();
    expect(lib.loaded).toBe(true);
  });
});

describe('library store · add flow', () => {
  const candidate = makeCandidate({ manga_id: '-new' });

  it('adds and inserts the returned manga', async () => {
    const lib = await loaded();
    const manga = makeManga({ manga_id: '-new', updated_at: 9e9 });
    server.replyOnce(200, ok({ status: 'added', manga }));

    const outcome = await lib.add(candidate, { confirmDuplicate: vi.fn() });

    expect(outcome).toEqual({ status: 'added', manga });
    expect(server.lastBody()).toEqual({ manga_id: '-new', source: 'dgmanga' });
    expect(lib.sorted[0].manga_id).toBe('-new');
  });

  it('duplicate → user confirms → resubmits with submit_sign 1', async () => {
    const lib = await loaded();
    const manga = makeManga({ manga_id: '-new' });
    server.replyOnce(409, { code: 409, error: 'duplicate', data: { duplicates: ['Similar'] } });
    server.replyOnce(200, ok({ status: 'added', manga }));
    const confirmDuplicate = vi.fn().mockResolvedValue(true);

    const outcome = await lib.add(candidate, { confirmDuplicate });

    expect(confirmDuplicate).toHaveBeenCalledWith(['Similar']);
    expect(server.lastBody()).toEqual({ manga_id: '-new', source: 'dgmanga', submit_sign: '1' });
    expect(outcome.status).toBe('added');
    expect(lib.byId('-new')).toBeTruthy();
  });

  it('duplicate → user declines → cancelled, nothing resubmitted', async () => {
    const lib = await loaded();
    server.replyOnce(409, { code: 409, error: 'duplicate', data: { duplicates: ['S'] } });
    const before = server.requests.length;

    const outcome = await lib.add(candidate, { confirmDuplicate: async () => false });

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(server.requests.length).toBe(before + 1);
    expect(lib.byId('-new')).toBeUndefined();
  });

  it('already-in-library → reports it and syncs the record', async () => {
    const lib = await loaded([makeManga({ manga_id: '-new', last_epi: 1 })]);
    const current = makeManga({ manga_id: '-new', last_epi: 7 });
    server.replyOnce(409, { code: 409, error: 'already-in-library', data: { manga: current } });

    const outcome = await lib.add(candidate, { confirmDuplicate: vi.fn() });

    expect(outcome).toEqual({ status: 'already-in-library', manga: current });
    expect(lib.byId('-new')!.last_epi).toBe(7);
  });

  it('search-expired → a distinguishable outcome, not a thrown error', async () => {
    const lib = await loaded();
    server.replyOnce(410, { code: 410, error: 'search-expired' });

    const outcome = await lib.add(candidate, { confirmDuplicate: vi.fn() });

    expect(outcome).toEqual({ status: 'search-expired' });
  });

  it('search-expired after confirming a duplicate is also reported', async () => {
    const lib = await loaded();
    server.replyOnce(409, { code: 409, error: 'duplicate', data: { duplicates: [] } });
    server.replyOnce(410, { code: 410, error: 'search-expired' });
    const outcome = await lib.add(candidate, { confirmDuplicate: async () => true });
    expect(outcome).toEqual({ status: 'search-expired' });
  });

  it('other failures reject with ApiError', async () => {
    const lib = await loaded();
    server.replyOnce(400, { code: 400, error: 'validation-failed' });
    await expect(lib.add(candidate, { confirmDuplicate: vi.fn() })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('library store · per-manga actions', () => {
  it('toggleAutoUpdate writes the new download_switch', async () => {
    const lib = await loaded([makeManga({ manga_id: 'a', download_switch: 0 })]);
    server.replyOnce(200, ok({ currentDownloadStatus: 1 }));
    await expect(lib.toggleAutoUpdate('a')).resolves.toBe(1);
    expect(server.lastRequest()!.url).toBe('library/a/auto-update');
    expect(lib.byId('a')!.download_switch).toBe(1);
  });

  it('fetchChapters and redownload hit the chapter endpoints', async () => {
    const lib = await loaded();
    const chapters = [{ index: 3, title: 'c3', url: 'u3' }];
    server.replyOnce(200, ok(chapters));
    await expect(lib.fetchChapters('a')).resolves.toEqual(chapters);

    server.replyOnce(200, ok({ taskId: 't9' }));
    await expect(lib.redownload('a', chapters)).resolves.toEqual({ taskId: 't9' });
    expect(server.lastBody()).toEqual({ manga_id: 'a', chapters });
  });

  it('remove deletes and drops the record', async () => {
    const lib = await loaded();
    server.replyOnce(200, ok(true));
    await lib.remove('a');
    expect(server.lastRequest()!.method).toBe('delete');
    expect(lib.byId('a')).toBeUndefined();
  });

  it('remove prompts for the admin token on 401 and retries', async () => {
    const lib = await loaded();
    const session = useSessionStore();
    session.setAdminTokenPrompt(async () => 'secret');
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.replyOnce(200, ok(true));

    await lib.remove('a');

    expect(server.requests.filter((r) => r.method === 'delete')).toHaveLength(2);
    expect(lib.byId('a')).toBeUndefined();
  });

  it('remove keeps the record when the server refuses', async () => {
    const lib = await loaded();
    server.replyOnce(409, { code: 409, error: 'manga-busy' });
    await expect(lib.remove('a')).rejects.toMatchObject({ error: 'manga-busy' });
    expect(lib.byId('a')).toBeTruthy();
  });

  it('rezip goes through the admin retry too', async () => {
    const lib = await loaded();
    useSessionStore().setAdminTokenPrompt(async () => 'secret');
    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.replyOnce(200, ok({ taskId: 'rz' }));
    await expect(lib.rezip()).resolves.toEqual({ taskId: 'rz' });
  });
});

describe('library store · socket updates', () => {
  it('applyChapterCompleted updates progress fields and re-sorts', async () => {
    const lib = await loaded([
      makeManga({ manga_id: 'a', updated_at: 100 }),
      makeManga({ manga_id: 'b', updated_at: 200 }),
    ]);
    lib.applyChapterCompleted({
      manga_id: 'a',
      chapter_index: 4,
      chapter_title: '第4话',
      last_epi: 4,
      last_epi_name: '第4话',
      updated_at: 300,
    });
    expect(lib.byId('a')).toMatchObject({ last_epi: 4, last_epi_name: '第4话', updated_at: 300 });
    expect(lib.sorted[0].manga_id).toBe('a');
  });

  it('applyChapterCompleted ignores unknown manga', async () => {
    const lib = await loaded();
    lib.applyChapterCompleted({
      manga_id: 'ghost',
      chapter_index: 1,
      chapter_title: '',
      last_epi: 1,
      last_epi_name: '',
      updated_at: 1,
    });
    expect(lib.items).toHaveLength(1);
  });

  it('applyDownloadCompleted replaces the record', async () => {
    const lib = await loaded([makeManga({ manga_id: 'a', completed: false })]);
    const finalRecord = makeManga({ manga_id: 'a', completed: true, last_epi: 10 });
    lib.applyDownloadCompleted({
      manga_id: 'a',
      kind: 'full-manga',
      status: 'done',
      chapters_total: 9,
      chapters_failed: 0,
      manga: finalRecord,
    });
    expect(lib.byId('a')).toEqual(finalRecord);
  });

  it('applyDownloadCompleted with manga null removes it', async () => {
    const lib = await loaded();
    lib.applyDownloadCompleted({
      manga_id: 'a',
      kind: 'full-manga',
      status: 'failed',
      chapters_total: 0,
      chapters_failed: 0,
      manga: null,
    });
    expect(lib.byId('a')).toBeUndefined();
  });

  it('applyDmcaAlert removes the manga and records the alert', async () => {
    const lib = await loaded();
    lib.applyDmcaAlert({ manga_id: 'a', manga_name: 'Gone' });
    expect(lib.byId('a')).toBeUndefined();
    expect(lib.dmcaAlerts).toEqual([{ manga_id: 'a', manga_name: 'Gone' }]);
    lib.dismissDmcaAlert('a');
    expect(lib.dmcaAlerts).toEqual([]);
  });
});
