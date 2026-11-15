import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

/** Static files and the SPA fallback, on the production boot path
 *  (src/bootstrap.ts). Needs `npm run build` in frontend/ first. */

describe('Frontend static serving (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vanmanga-static-'));
    Object.assign(process.env, {
      LIBRARY_FILE: join(dir, 'config', 'manga_library.json'),
      DOWNLOAD_ROOT: join(dir, 'downloaded'),
      THUMBNAILS_DIR: join(dir, 'thumbnails'),
      PYTHON_WORKING_DIR: dir,
      KAVITA_BASE_URL: '',
      FLARESOLVERR_URL: '',
    });
    delete process.env.QUEUE_FILE;

    const { createApp } = await import('../src/bootstrap');
    app = await createApp({ logger: ['error'], abortOnError: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const SPA = /<div id="app"[^>]*>/;

  it('GET / returns the SPA index.html', async () => {
    const res = await http().get('/').expect(200);
    expect(res.text).toMatch(SPA);
  });

  it.each(['/settings', '/mainpage/mangaku', '/library/abc'])(
    'GET %s (a client-side route) falls back to index.html',
    async (path) => {
      const res = await http().get(path).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toMatch(SPA);
    },
  );

  it('HEAD on a client-side route is 200 as well', async () => {
    await http().head('/settings').expect(200);
  });

  it('serves a real hashed asset', async () => {
    const index = await http().get('/').expect(200);
    const asset = /assets\/index-[^"]+\.js/.exec(index.text)?.[0];
    expect(asset).toBeDefined();
    const res = await http().get(`/${asset}`).expect(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    await http().get('/favicon.ico').expect(200);
  });

  it('GET /js/config.js is gone (the SPA reads GET /api/config)', async () => {
    const res = await http().get('/js/config.js').expect(404);
    expect(res.body).toMatchObject({ code: 404, error: 'not-found' });
  });

  it.each(['/assets/missing-abc.js', '/assets/nope.js', '/nope.png'])(
    'a missing asset (%s) is a 404, not index.html',
    async (path) => {
      const res = await http().get(path).expect(404);
      expect(res.body).toMatchObject({ code: 404, error: 'not-found' });
    },
  );

  it('POST to a page route is a 404', async () => {
    await http().post('/settings').expect(404);
  });
});
