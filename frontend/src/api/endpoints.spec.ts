import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http } from './http';
import * as api from './endpoints';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { makeManga } from '@/test/fixtures';

let server: FakeServer;
beforeEach(() => {
  server = fakeServer(http);
});
afterEach(() => server.restore());

function ok(data: unknown) {
  server.reply(200, { code: 200, data });
}

function sent() {
  const req = server.lastRequest()!;
  return { method: req.method?.toUpperCase(), url: req.url, params: req.params };
}

describe('endpoints', () => {
  it('getConfig: GET config', async () => {
    const cfg = { kavitaEnabled: true, kavitaExposeUrl: 'http://k', adminRequired: false };
    ok(cfg);
    await expect(api.getConfig()).resolves.toEqual(cfg);
    expect(sent()).toMatchObject({ method: 'GET', url: 'config' });
  });

  it('getSources: GET scraper/sources', async () => {
    ok([{ name: 'dgmanga', displayName: 'Example Source' }]);
    await expect(api.getSources()).resolves.toHaveLength(1);
    expect(sent()).toMatchObject({ method: 'GET', url: 'scraper/sources' });
  });

  it('searchManga: GET scraper/:source/search with q as a query param', async () => {
    ok([]);
    await expect(api.searchManga('dgmanga', '海贼 王')).resolves.toEqual([]);
    expect(sent()).toMatchObject({
      method: 'GET',
      url: 'scraper/dgmanga/search',
      params: { q: '海贼 王' },
    });
  });

  it('getLibrary: GET library', async () => {
    ok([makeManga({ manga_id: 'a' })]);
    const list = await api.getLibrary();
    expect(list[0].manga_id).toBe('a');
    expect(sent()).toMatchObject({ method: 'GET', url: 'library' });
  });

  it('addManga: POST library with only the lean fields', async () => {
    ok({ status: 'cancelled' });
    await api.addManga({ manga_id: '-x', source: 'dgmanga', submit_sign: '2' });
    expect(sent()).toMatchObject({ method: 'POST', url: 'library' });
    expect(server.lastBody()).toEqual({ manga_id: '-x', source: 'dgmanga', submit_sign: '2' });
  });

  it('addManga: omits submit_sign on a first submit', async () => {
    ok({ status: 'added', manga: makeManga() });
    await api.addManga({ manga_id: 'x', source: 'dgmanga' });
    expect(server.lastBody()).toEqual({ manga_id: 'x', source: 'dgmanga' });
  });

  it('getLibraryChapters: encodes the id in the path', async () => {
    ok([{ index: 1, title: 't', url: 'u' }]);
    await api.getLibraryChapters('-Lo/L');
    expect(sent()).toMatchObject({ method: 'GET', url: 'library/-Lo%2FL/chapters' });
  });

  it('toggleAutoUpdate: POST library/:id/auto-update', async () => {
    ok({ currentDownloadStatus: 1 });
    await expect(api.toggleAutoUpdate('a b')).resolves.toEqual({ currentDownloadStatus: 1 });
    expect(sent()).toMatchObject({ method: 'POST', url: 'library/a%20b/auto-update' });
  });

  it('deleteManga: DELETE library/:id', async () => {
    ok(true);
    await expect(api.deleteManga('-LoL2tSY')).resolves.toBe(true);
    expect(sent()).toMatchObject({ method: 'DELETE', url: 'library/-LoL2tSY' });
  });

  it('rezipLibrary: POST library/rezip', async () => {
    ok({ taskId: 't1' });
    await expect(api.rezipLibrary()).resolves.toEqual({ taskId: 't1' });
    expect(sent()).toMatchObject({ method: 'POST', url: 'library/rezip' });
  });

  it('queueDownload: POST download { manga_id }', async () => {
    ok({ taskId: 't2' });
    await api.queueDownload('m');
    expect(sent()).toMatchObject({ method: 'POST', url: 'download' });
    expect(server.lastBody()).toEqual({ manga_id: 'm' });
  });

  it('queueRedownload: POST download/chapters { manga_id, chapters }', async () => {
    ok({ taskId: 't3' });
    const chapters = [{ index: 2, title: 'c2', url: 'u2' }];
    await api.queueRedownload('m', chapters);
    expect(sent()).toMatchObject({ method: 'POST', url: 'download/chapters' });
    expect(server.lastBody()).toEqual({ manga_id: 'm', chapters });
  });

  it('getQueue / getCurrentTask', async () => {
    ok({ active: null, pending: [] });
    await expect(api.getQueue()).resolves.toEqual({ active: null, pending: [] });
    expect(sent()).toMatchObject({ method: 'GET', url: 'download/queue' });

    ok(null);
    await expect(api.getCurrentTask()).resolves.toBeNull();
    expect(sent()).toMatchObject({ method: 'GET', url: 'download/current' });
  });

  it('kavitaLogin / kavitaRefreshToken', async () => {
    ok({ apiKey: 'k', jwt: 'j', refreshToken: 'r', loginUrl: 'http://k/login?apiKey=k' });
    await api.kavitaLogin('u', 'p');
    expect(sent()).toMatchObject({ method: 'POST', url: 'kavita/login' });
    expect(server.lastBody()).toEqual({ username: 'u', password: 'p' });

    ok({ jwt: 'j2', refreshToken: 'r2' });
    await expect(api.kavitaRefreshToken({ jwt: 'j', refreshToken: 'r' })).resolves.toEqual({
      jwt: 'j2',
      refreshToken: 'r2',
    });
    expect(sent()).toMatchObject({ method: 'POST', url: 'kavita/refreshtoken' });
    expect(server.lastBody()).toEqual({ jwt: 'j', refreshToken: 'r' });
  });

  it('thumbnail URL builders are same-origin and encoded', () => {
    expect(api.libraryThumbnailUrl('-a/b')).toBe('/api/library/-a%2Fb/thumbnail');
    expect(api.searchThumbnailUrl('dgmanga', 'x y')).toBe(
      '/api/scraper/dgmanga/search-thumbnail/x%20y',
    );
  });

  it('rejects with the typed error of the failing endpoint', async () => {
    server.reply(404, { code: 404, error: 'manga-not-found' });
    await expect(api.toggleAutoUpdate('nope')).rejects.toMatchObject({
      status: 404,
      error: 'manga-not-found',
    });
  });
});
