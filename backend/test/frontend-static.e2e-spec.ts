import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Frontend static serving (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });

    // Same pipeline as production (main.ts): /api prefix, SPA fallback
    // ahead of Nest's 404 handler.
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the SPA index.html', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<div id="app"[^>]*>/);
  });

  it('GET /some/client/route falls back to index.html', async () => {
    const res = await request(app.getHttpServer()).get('/library/abc');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<div id="app"[^>]*>/);
  });

  it('GET /js/config.js is gone (the SPA reads GET /api/config)', async () => {
    await request(app.getHttpServer()).get('/js/config.js').expect(404);
  });

  it('a missing asset is a 404, not index.html', async () => {
    await request(app.getHttpServer()).get('/assets/missing-abc.js').expect(404);
  });
});
