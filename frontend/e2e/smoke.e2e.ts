import { test, expect } from '@playwright/test';
import { ADMIN_TOKEN } from '../playwright.config';

// search → add → appears in the library → delete (with the admin token) → gone
test('search, add, then delete a manga with the admin token', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await expect(page.getByText('还没有漫画，在上方搜索并添加')).toBeVisible();

  // Search from the top bar.
  const search = page.getByTestId('topbar-search');
  await search.fill('测试');
  await search.press('Enter');

  const result = page.getByTestId('search-result--ui1');
  await expect(result).toContainText('测试漫画一');
  await result.getByRole('button', { name: '添加《测试漫画一》' }).click();
  await expect(result.getByRole('button', { name: '已在库中' })).toBeDisabled();
  await expect(page.getByText('已添加《测试漫画一》', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '关闭' }).click();

  // It is in the library; wait for its (empty) download to finish.
  const card = page.getByTestId('manga-card--ui1');
  await expect(card).toContainText('测试漫画一');
  await expect(card.getByTestId('card-overlay')).toHaveCount(0);
  await expect(page.getByTestId('queue-button')).toHaveText('队列');

  // Delete: confirm, then enter the admin token.
  await card.getByRole('button', { name: '《测试漫画一》的操作' }).click();
  await page.getByRole('menuitem', { name: '删除' }).click();
  await expect(page.getByRole('dialog')).toContainText('删除已下载的文件');
  await page.getByTestId('confirm-ok').click();

  const token = page.getByTestId('admin-token-input');
  await expect(token).toBeVisible();
  await token.fill('wrong-token');
  await page.getByRole('button', { name: '确认' }).click();
  await expect(page.getByTestId('admin-token-error')).toContainText('管理员口令不正确');
  await token.fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: '确认' }).click();

  await expect(card).toHaveCount(0);
  await expect(page.getByText('还没有漫画，在上方搜索并添加')).toBeVisible();

  // The expected 401s of the admin-token round trip are the only noise allowed.
  expect(problems.filter((p) => !p.includes('401'))).toEqual([]);
});
