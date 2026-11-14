import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { makeCandidate } from '@/test/fixtures';
import { useMangaSearch } from './useMangaSearch';

let server: FakeServer;
beforeEach(() => {
  server = fakeServer(http);
});
afterEach(() => server.restore());

const ok = (data: unknown) => ({ code: 200, data });

describe('useMangaSearch', () => {
  it('searches the trimmed query and exposes the results', async () => {
    const s = useMangaSearch();
    server.replyOnce(200, ok([makeCandidate({ manga_id: 'x' })]));
    s.query.value = '  海贼 ';
    await s.search();

    expect(server.lastRequest()).toMatchObject({
      url: 'scraper/dgmanga/search',
      params: { q: '海贼' },
    });
    expect(s.results.value.map((c) => c.manga_id)).toEqual(['x']);
    expect(s.lastQuery.value).toBe('海贼');
    expect(s.loading.value).toBe(false);
    expect(s.error.value).toBeNull();
  });

  it('uses the given source', async () => {
    const s = useMangaSearch('other');
    server.replyOnce(200, ok([]));
    await s.search('q');
    expect(server.lastRequest()!.url).toBe('scraper/other/search');
  });

  it('an empty query clears the results without a request', async () => {
    const s = useMangaSearch();
    server.replyOnce(200, ok([makeCandidate()]));
    await s.search('a');
    await s.search('   ');
    expect(server.requests).toHaveLength(1);
    expect(s.results.value).toEqual([]);
    expect(s.error.value).toBeNull();
  });

  it('is loading while a search is in flight', async () => {
    const s = useMangaSearch();
    const held = server.replyDeferred();
    const p = s.search('a');
    await held.received;
    expect(s.loading.value).toBe(true);
    held.resolve(200, ok([]));
    await p;
    expect(s.loading.value).toBe(false);
  });

  it('a newer search aborts the previous one; its late result is ignored', async () => {
    const s = useMangaSearch();
    const first = server.replyDeferred();
    const second = server.replyDeferred();
    const p1 = s.search('one');
    const firstReq = await first.received;
    const p2 = s.search('two');
    await second.received;

    expect((firstReq.signal as AbortSignal).aborted).toBe(true);
    second.resolve(200, ok([makeCandidate({ manga_id: 'two' })]));
    first.resolve(200, ok([makeCandidate({ manga_id: 'one' })]));
    await Promise.all([p1, p2]);

    expect(s.results.value.map((c) => c.manga_id)).toEqual(['two']);
    expect(s.lastQuery.value).toBe('two');
    expect(s.error.value).toBeNull();
    expect(s.loading.value).toBe(false);
  });

  it('records failures as ApiError and keeps no stale results', async () => {
    const s = useMangaSearch();
    server.replyOnce(200, ok([makeCandidate()]));
    await s.search('a');
    server.replyOnce(502, { code: 502, error: 'scraper-blocked' });
    await expect(s.search('b')).resolves.toBeUndefined();
    expect(s.error.value).toMatchObject({ error: 'scraper-blocked' });
    expect(s.results.value).toEqual([]);
  });

  it('research() repeats the last submitted query (after search-expired)', async () => {
    const s = useMangaSearch();
    server.replyOnce(200, ok([makeCandidate({ manga_id: 'old' })]));
    await s.search('海贼');
    s.query.value = 'typed but not submitted';
    server.replyOnce(200, ok([makeCandidate({ manga_id: 'fresh' })]));

    await s.research();

    expect(server.lastRequest()!.params).toEqual({ q: '海贼' });
    expect(s.results.value.map((c) => c.manga_id)).toEqual(['fresh']);
  });

  it('research() without a previous search does nothing', async () => {
    await useMangaSearch().research();
    expect(server.requests).toHaveLength(0);
  });

  it('cancel() aborts the request in flight silently', async () => {
    const s = useMangaSearch();
    const held = server.replyDeferred();
    const p = s.search('a');
    const req = await held.received;
    s.cancel();
    await p;
    expect((req.signal as AbortSignal).aborted).toBe(true);
    expect(s.loading.value).toBe(false);
    expect(s.error.value).toBeNull();
  });

  it('aborts the request in flight when its scope is disposed', async () => {
    const scope = effectScope();
    const s = scope.run(() => useMangaSearch())!;
    const held = server.replyDeferred();
    const p = s.search('a');
    const req = await held.received;
    scope.stop();
    await p;
    expect((req.signal as AbortSignal).aborted).toBe(true);
  });
});
