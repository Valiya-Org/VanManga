import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

/** CORS_ORIGINS opt-in: only the listed origins get CORS headers, on both
 *  the HTTP API and Socket.IO. (The default — no headers — is covered in
 *  api-contract.e2e-spec.ts.) */

const ALLOWED = 'http://allowed.example';

describe('CORS_ORIGINS opt-in (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vanmanga-cors-'));
    Object.assign(process.env, {
      LIBRARY_FILE: join(dir, 'config', 'manga_library.json'),
      DOWNLOAD_ROOT: join(dir, 'downloaded'),
      THUMBNAILS_DIR: join(dir, 'thumbnails'),
      PYTHON_WORKING_DIR: dir,
      CORS_ORIGINS: ` ${ALLOWED} , http://other.example `,
    });
    delete process.env.QUEUE_FILE;

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/app.setup');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: ['error'],
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = savedEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());

  it('allows a listed origin on the HTTP API', async () => {
    const preflight = await http()
      .options('/api/library/x')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'DELETE')
      .set('Access-Control-Request-Headers', 'x-admin-token');
    expect(preflight.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('refuses an unlisted origin on the HTTP API', async () => {
    const preflight = await http()
      .options('/api/library/x')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'DELETE');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('applies the same list to Socket.IO', async () => {
    const ok = await http().get('/socket.io/?EIO=4&transport=polling').set('Origin', ALLOWED).expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe(ALLOWED);
    const evil = await http().get('/socket.io/?EIO=4&transport=polling').set('Origin', 'http://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
