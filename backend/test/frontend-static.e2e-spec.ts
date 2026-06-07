import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { spaFallback } from '../src/modules/frontend/spa-fallback';

describe('Frontend static serving (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();

    // Match production bootstrap (main.ts): global /api prefix with the SPA
    // root and dynamic config excluded, and the SPA fallback registered
    // before init so it sits ahead of Nest's 404 handler. The fallback is
    // gated to extension-less paths, so /js/config.js still reaches the
    // controller.
    app.setGlobalPrefix('api', { exclude: ['/', 'js/config.js'] });
    app.use(spaFallback);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the SPA index.html', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });

  it('GET /js/config.js returns runtime config (not shadowed by SPA fallback)', async () => {
    const res = await request(app.getHttpServer()).get('/js/config.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('window.MANGA_BASE_URL');
  });
});
