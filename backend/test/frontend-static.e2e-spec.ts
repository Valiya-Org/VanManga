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

    // Same pipeline as production (main.ts): /api prefix with the SPA root
    // and /js/config.js excluded, SPA fallback ahead of Nest's 404 handler.
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

  it('GET /js/config.js returns runtime config (not shadowed by SPA fallback)', async () => {
    const res = await request(app.getHttpServer()).get('/js/config.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('window.MANGA_BASE_URL');
  });
});
