// Starts the real NestJS backend (backend/dist, which also serves
// frontend/dist) for the Playwright suite, on a fresh temporary data
// directory, with the fake scraper in place of scrape_cli.py.
//
// Needs `npm run build` in backend/ and frontend/ first.
//
// E2E_BACKEND_MAIN=1 (set in CI) runs the production entry dist/main.js.
// Otherwise the app is built by the same createApp() main.js uses
// (dist/bootstrap.js, also used by backend/test/*.e2e-spec.ts), skipping
// only main.js's TLS trust-store check, which refuses to start on a Node
// older than the .nvmrc version and is irrelevant here (the fake scraper
// makes no outbound requests).
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
  require(require.resolve('reflect-metadata', { paths: [BACKEND_DIST] }));
  const { createApp } = require(join(BACKEND_DIST, 'bootstrap.js'));

  (async () => {
    const app = await createApp({ logger: ['log', 'error', 'warn'] });
    await app.listen(Number(process.env.PORT));
    console.log(`[e2e] backend on http://127.0.0.1:${process.env.PORT} (data: ${dir})`);
  })().catch((err) => {
    console.error('[e2e] backend failed to start', err);
    process.exit(1);
  });
}
