// Starts the real NestJS backend (backend/dist, which also serves
// frontend/dist) for the Playwright suite, on a fresh temporary data
// directory, with the fake scraper in place of scrape_cli.py.
//
// Needs `npm run build` in backend/ and frontend/ first.
//
// E2E_BACKEND_MAIN=1 (set in CI) runs the production entry dist/main.js.
// Otherwise the app is booted the way backend/test/*.e2e-spec.ts boot it
// (AppModule + configureApp, no Swagger): main.js refuses to start on a Node
// older than the .nvmrc version because of a TLS trust-store check, which is
// irrelevant here (the fake scraper makes no outbound requests).
'use strict';
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const BACKEND_DIST = resolve(__dirname, '../../backend/dist');
const dir = mkdtempSync(join(tmpdir(), 'vanmanga-ui-e2e-'));

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: process.env.PORT || '5480',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'e2e-admin-token',
  LIBRARY_FILE: join(dir, 'config', 'manga_library.json'),
  QUEUE_FILE: join(dir, 'config', 'queue.json'),
  DOWNLOAD_ROOT: join(dir, 'downloaded'),
  THUMBNAILS_DIR: join(dir, 'thumbnails'),
  PYTHON_EXECUTABLE: process.execPath,
  PYTHON_CLI_SCRIPT: resolve(__dirname, 'fake-scraper.cjs'),
  PYTHON_WORKING_DIR: dir,
  KAVITA_BASE_URL: '',
  KAVITA_EXPOSE_URL: '',
  KAVITA_ADMIN_APIKEY: '',
  FLARESOLVERR_URL: '',
});

function cleanup() {
  rmSync(dir, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));

if (process.env.E2E_BACKEND_MAIN === '1') {
  require(join(BACKEND_DIST, 'main.js'));
} else {
  const fromBackend = (id) => require(require.resolve(id, { paths: [BACKEND_DIST] }));
  fromBackend('reflect-metadata');
  const { NestFactory } = fromBackend('@nestjs/core');
  const { AppModule } = require(join(BACKEND_DIST, 'app.module.js'));
  const { configureApp } = require(join(BACKEND_DIST, 'app.setup.js'));

  (async () => {
    const app = await NestFactory.create(AppModule, {
      bodyParser: false,
      logger: ['log', 'error', 'warn'],
    });
    configureApp(app);
    await app.listen(Number(process.env.PORT));
    console.log(`[e2e] backend on http://127.0.0.1:${process.env.PORT} (data: ${dir})`);
  })().catch((err) => {
    console.error('[e2e] backend failed to start', err);
    process.exit(1);
  });
}
