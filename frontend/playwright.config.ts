import { defineConfig, devices } from '@playwright/test';
import { ADMIN_TOKEN } from './e2e/constants';

// End-to-end tests against the real backend serving the built frontend.
// Build first: `npm run build` here and in ../backend. See README.md.
const PORT = Number(process.env.E2E_PORT ?? 5480);

export default defineConfig({
  testDir: './e2e',
  // One backend with shared state: run serially.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // No retries: the backend and its library outlive a failed attempt, so a
  // retry would start from a dirty library and fail for the wrong reason.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'zh-CN',
  },
  projects: [
    // `npm run test:e2e` — the smoke flow (also in CI).
    { name: 'smoke', testMatch: /smoke\.e2e\.ts/, use: { ...devices['Desktop Chrome'] } },
    // `npm run screenshots` — review screenshots into docs/review/.
    { name: 'screenshots', testMatch: /screenshots\.e2e\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node e2e/start-backend.cjs',
    url: `http://127.0.0.1:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    env: { PORT: String(PORT), ADMIN_TOKEN },
  },
});
