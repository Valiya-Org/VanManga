import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Review screenshots (not part of CI): library, search panel, queue drawer and
// settings at desktop and phone widths, written to docs/review/p3b-screenshots/.
const OUT = fileURLToPath(new URL('../../docs/review/p3b-screenshots/', import.meta.url));

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 800 },
  { name: '375', width: 375, height: 812 },
];

test.beforeAll(async ({ request }) => {
  // Seed the library through the real API (search fills the server cache).
  const found = await request.get('/api/scraper/dgmanga/search', { params: { q: '截图' } });
  expect(found.ok()).toBe(true);
  // ui2 keeps downloading (see fake-scraper.cjs), so ui3 waits behind it;
  // ui4 stays out of the library to show an "添加" button.
  for (const id of ['-ui1', 'ui2', 'ui3']) {
    const res = await request.post('/api/library', { data: { manga_id: id, source: 'dgmanga', submit_sign: '1' } });
    expect(res.ok()).toBe(true);
  }
  await expect
    .poll(async () => {
      const q = (await (await request.get('/api/download/queue')).json()) as {
        data: { active: { mangaId?: string } | null; pending: { mangaId?: string }[] };
      };
      return q.data.active?.mangaId === 'ui2' && q.data.pending.some((t) => t.mangaId === 'ui3');
    })
    .toBe(true);
});

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400); // overlay transitions
}

for (const vp of VIEWPORTS) {
  test(`screenshots at ${vp.name}px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const shot = (name: string) => page.screenshot({ path: `${OUT}${name}-${vp.name}.png` });

    await page.goto('/');
    await expect(page.getByTestId('library-grid')).toBeVisible();
    await expect(page.getByTestId('manga-card-ui2').getByTestId('card-overlay')).toContainText('下载中');
    await settle(page);
    // No horizontal scrolling at any width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    await shot('library');

    await page.getByRole('button', { name: '列表' }).click();
    await settle(page);
    await shot('library-list');
    await page.getByRole('button', { name: '卡片' }).click();

    const search = page.getByTestId('topbar-search');
    await search.fill('星之');
    await search.press('Enter');
    await expect(page.getByTestId('search-result-ui4')).toBeVisible();
    await settle(page);
    await shot('search');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('search-panel')).toHaveCount(0);

    await page.getByTestId(vp.width < 768 ? 'queue-tab' : 'queue-button').click();
    await expect(page.getByTestId('queue-content')).toBeVisible();
    await settle(page);
    await shot('queue');
    await page.keyboard.press('Escape');

    await page.goto('/settings');
    await expect(page.getByTestId('settings-view')).toBeVisible();
    await settle(page);
    await shot('settings');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

    await page.goto('/');
    await page.getByTestId('manga-actions').first().click();
    await settle(page);
    await shot('menu');
  });
}
