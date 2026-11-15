import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import request from 'supertest';

/** The canonical contract (docs/api-contract.md) end to end on the real
 *  AppModule: search → add → library → delete, with the fake scraper CLI
 *  standing in for scrape_cli.py. */

const ADMIN_TOKEN = 'e2e-admin-token';
const FAKE_CLI = resolve(__dirname, '../src/modules/scraper/python/__fixtures__/fake-cli.cjs');

describe('Canonical API contract (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vanmanga-e2e-'));
    Object.assign(process.env, {
      LIBRARY_FILE: join(dir, 'config', 'manga_library.json'),
      DOWNLOAD_ROOT: join(dir, 'downloaded'),
      THUMBNAILS_DIR: join(dir, 'thumbnails'),
      PYTHON_EXECUTABLE: process.execPath,
      PYTHON_CLI_SCRIPT: FAKE_CLI,
      PYTHON_WORKING_DIR: dir,
      ADMIN_TOKEN,
      KAVITA_BASE_URL: '',
      KAVITA_EXPOSE_URL: '',
      KAVITA_ADMIN_APIKEY: '',
      FLARESOLVERR_URL: '',
    });
    delete process.env.QUEUE_FILE;

    // Imported only now: configuration() reads process.env when the
    // module graph is built.
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: ['error'],
    });
    configureApp(app);
    await app.init();

    const { EventsGateway } = await import('../src/modules/events/events.gateway');
    socketEmit = jest.spyOn(app.get(EventsGateway).server, 'emit');
  });

  let socketEmit: jest.SpyInstance;
  const emitted = (event: string) =>
    socketEmit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload as Record<string, unknown>);

  afterAll(async () => {
    await app?.close();
    process.env = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());

  /** Wait until the single-worker queue has nothing running or pending. */
  async function queueIdle(): Promise<void> {
    for (let i = 0; i < 100; i += 1) {
      const res = await http().get('/api/download/queue').expect(200);
      if (res.body.data.active === null && res.body.data.pending.length === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('queue never became idle');
  }

  it('GET /api/config describes the runtime', async () => {
    await http()
      .get('/api/config')
      .expect(200, {
        code: 200,
        data: { kavitaEnabled: false, kavitaExposeUrl: null, adminRequired: true },
      });
  });

  it('search → add → library → delete', async () => {
    // --- search: no results is an empty list, not an error
    await http().get('/api/scraper/dgmanga/search?q=nothing').expect(200, { code: 200, data: [] });
    const blank = await http().get('/api/scraper/dgmanga/search?q=').expect(400);
    expect(blank.body).toMatchObject({ code: 400, error: 'query-required' });

    const search = await http().get('/api/scraper/dgmanga/search?q=E2E').expect(200);
    expect(search.body.code).toBe(200);
    expect(search.body.data).toHaveLength(2);
    const [first] = search.body.data;
    expect(first).toMatchObject({
      manga_id: '-e2e1',
      manga_name: 'E2E Manga',
      source: 'dgmanga',
      thumbnail: '/api/scraper/dgmanga/search-thumbnail/-e2e1',
    });
    const cover = await http().get(first.thumbnail).expect(200);
    expect(cover.headers['content-type']).toMatch(/image\/jpeg/);

    // --- add (lean body), queued automatically
    const added = await http()
      .post('/api/library')
      .send({ manga_id: '-e2e1', source: 'dgmanga' })
      .expect(200);
    expect(added.body.data.status).toBe('added');
    const manga = added.body.data.manga;
    expect(manga).toMatchObject({
      manga_id: '-e2e1',
      manga_name: 'E2E Manga',
      thumbnail: '/api/library/-e2e1/thumbnail',
      kavita_url: null,
      source: 'dgmanga',
      completed: false,
    });
    expect(manga.updated_at).toBe(manga.add_date);

    const again = await http().post('/api/library').send({ manga_id: '-e2e1', source: 'dgmanga' }).expect(409);
    expect(again.body).toMatchObject({ code: 409, error: 'already-in-library', data: { manga: { manga_id: '-e2e1' } } });

    // --- a similar name needs confirmation
    const dup = await http().post('/api/library').send({ manga_id: '-e2e2', source: 'dgmanga' }).expect(409);
    expect(dup.body).toMatchObject({ code: 409, error: 'duplicate', data: { duplicates: ['E2E Manga'] } });
    await http()
      .post('/api/library')
      .send({ manga_id: '-e2e2', source: 'dgmanga', submit_sign: '1' })
      .expect(200);

    const expired = await http().post('/api/library').send({ manga_id: '-never-searched', source: 'dgmanga' }).expect(410);
    expect(expired.body.error).toBe('search-expired');

    // --- library after the download ran
    await queueIdle();
    const lib = await http().get('/api/library').expect(200);
    const record = lib.body.data.find((m: { manga_id: string }) => m.manga_id === '-e2e1');
    expect(record).toMatchObject({ completed: true, thumbnail: '/api/library/-e2e1/thumbnail' });
    expect(record.updated_at).toBeGreaterThanOrEqual(Math.floor(manga.add_date));
    expect(record.add_date).toBe(manga.add_date);

    // --- socket broadcasts from the real module graph
    expect(emitted('download_started')).toContainEqual({ manga_id: '-e2e1', kind: 'full-manga' });
    expect(emitted('download_completed')).toContainEqual(
      expect.objectContaining({ manga_id: '-e2e1', kind: 'full-manga', status: 'done', chapters_total: 0 }),
    );
    // only the canonical events are broadcast
    const { SOCKET_EVENTS } = await import('../src/modules/events/events.types');
    const canonical: string[] = Object.values(SOCKET_EVENTS);
    expect(socketEmit.mock.calls.map(([name]) => name).filter((n) => !canonical.includes(n))).toEqual([]);
    const queueUpdates = emitted('queue_updated');
    expect(queueUpdates.some((s) => (s.active as { mangaId?: string } | null)?.mangaId === '-e2e1')).toBe(true);
    expect(queueUpdates.at(-1)).toEqual({ active: null, pending: [] });

    const thumb = await http().get('/api/library/-e2e1/thumbnail').expect(200);
    expect(thumb.headers['content-type']).toMatch(/image\/jpeg/);
    await http().get('/api/library/-e2e1/chapters').expect(200, { code: 200, data: [] });

    // the library file stores relative cover URLs, not a domain
    const stored = JSON.parse(readFileSync(process.env.LIBRARY_FILE!, 'utf8'));
    expect(stored['-e2e1'].thumbnail).toBe('/api/library/-e2e1/thumbnail');

    // --- delete: admin token required
    const noToken = await http().delete('/api/library/-e2e1').expect(401);
    expect(noToken.body).toMatchObject({ code: 401, error: 'admin-token-required' });
    const badToken = await http().delete('/api/library/-e2e1').set('X-Admin-Token', 'nope').expect(401);
    expect(badToken.body.error).toBe('admin-token-invalid');
    await http()
      .delete('/api/library/-e2e1')
      .set('X-Admin-Token', ADMIN_TOKEN)
      .expect(200, { code: 200, data: true });
    await http().delete('/api/library/-e2e2').set('X-Admin-Token', ADMIN_TOKEN).expect(200);

    const after = await http().get('/api/library').expect(200);
    expect(after.body).toEqual({ code: 200, data: [] });
    const gone = await http().delete('/api/library/-e2e1').set('X-Admin-Token', ADMIN_TOKEN).expect(404);
    expect(gone.body).toMatchObject({ code: 404, error: 'manga-not-found' });

    // --- the queue was persisted next to the library file and is now empty
    const queueFile = join(dir, 'config', 'queue.json');
    expect(existsSync(queueFile)).toBe(true);
    expect(JSON.parse(readFileSync(queueFile, 'utf8'))).toEqual({ version: 1, tasks: [] });
  });

  it('POST /api/library/rezip requires the admin token', async () => {
    const res = await http().post('/api/library/rezip').expect(401);
    expect(res.body).toMatchObject({ code: 401, error: 'admin-token-required' });
  });

  it('unknown routes and bad bodies use the failure envelope', async () => {
    const nf = await http().get('/api/no-such-route').expect(404);
    expect(nf.body).toMatchObject({ code: 404, error: 'not-found' });
    const bad = await http().post('/api/download').send({}).expect(400);
    expect(bad.body).toMatchObject({ code: 400, error: 'validation-failed' });
  });

  it('Swagger documents every canonical route and none of the legacy ones', async () => {
    const { buildSwaggerDocument } = await import('../src/swagger');
    const doc = buildSwaggerDocument(app);
    const ops = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.keys(item as object).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(ops).toEqual(
      expect.arrayContaining([
        'GET /api/config',
        'GET /api/library',
        'POST /api/library',
        'GET /api/library/short',
        'GET /api/library/paginate',
        'GET /api/library/search',
        'POST /api/library/{mangaId}/auto-update',
        'DELETE /api/library/{mangaId}',
        'GET /api/library/{mangaId}/thumbnail',
        'GET /api/library/{mangaId}/chapters',
        'POST /api/library/rezip',
        'POST /api/download',
        'POST /api/download/chapters',
        'GET /api/download/queue',
        'GET /api/download/current',
        'GET /api/scraper/sources',
        'GET /api/scraper/{source}/search',
        'GET /api/scraper/{source}/search-thumbnail/{mangaId}',
        'POST /api/kavita/login',
        'POST /api/kavita/refreshtoken',
      ]),
    );
    expect(ops.filter((op) => op.includes('dogemanga'))).toEqual([]);
    expect(ops).not.toContain('GET /api/kavita/status');

    const security = (method: 'delete' | 'post', path: string) =>
      (doc.paths[path] as Record<string, { security?: unknown[] }>)[method].security;
    expect(security('delete', '/api/library/{mangaId}')).toEqual([{ 'admin-token': [] }]);
    expect(security('post', '/api/library/rezip')).toEqual([{ 'admin-token': [] }]);
  });
});
