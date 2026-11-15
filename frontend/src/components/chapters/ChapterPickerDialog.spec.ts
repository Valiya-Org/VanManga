import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { mountWithApp, findButton, click, bodyText, waitForText } from '@/test/mount';
import { makeManga } from '@/test/fixtures';
import { useLibraryStore } from '@/stores/library';
import { useUiStore } from '@/stores/ui';
import type { Chapter } from '@/api/types';
import ChapterPickerDialog from './ChapterPickerDialog.vue';

let server: FakeServer;
beforeEach(() => (server = fakeServer(http)));
afterEach(() => server.restore());
enableAutoUnmount(afterEach);

const chapters: Chapter[] = [1, 2, 3].map((i) => ({ index: i, title: `第${i}话`, url: `http://s/${i}` }));

async function openPicker() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useLibraryStore().items = [makeManga({ manga_id: 'm1', manga_name: '火影' })];
  await mountWithApp(ChapterPickerDialog, { pinia });
  useUiStore().openChapterPicker('m1');
  await flushPromises();
}

const chips = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="chapter-chip"]')];
const confirmButton = () => document.querySelector<HTMLButtonElement>('[data-testid="chapter-confirm"]')!;
const countText = () => document.querySelector('[data-testid="chapter-count"]')?.textContent?.trim();

describe('ChapterPickerDialog', () => {
  it('loads the chapters and supports select all / invert / toggle', async () => {
    server.replyOnce(200, { code: 200, data: chapters });
    await openPicker();
    expect(bodyText()).toContain('《火影》· 选择章节');
    expect(server.requests[0].url).toBe('library/m1/chapters');
    expect(chips()).toHaveLength(3);
    expect(countText()).toBe('已选 0 / 3');
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().textContent).toContain('重新下载 0 话');

    await click(findButton('全选'));
    expect(countText()).toBe('已选 3 / 3');
    await click(chips()[1]);
    expect(countText()).toBe('已选 2 / 3');
    expect(chips()[1].getAttribute('aria-pressed')).toBe('false');
    await click(findButton('反选'));
    expect(countText()).toBe('已选 1 / 3');
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(confirmButton().disabled).toBe(false);
    expect(confirmButton().textContent).toContain('重新下载 1 话');
  });

  it('re-downloads the selection, then closes', async () => {
    server.replyOnce(200, { code: 200, data: chapters });
    await openPicker();
    await click(chips()[0]);
    await click(chips()[2]);
    server.replyOnce(200, { code: 200, data: { taskId: 't1' } });
    await click(confirmButton());
    expect(server.lastRequest()?.url).toBe('download/chapters');
    expect(server.lastBody()).toEqual({ manga_id: 'm1', chapters: [chapters[0], chapters[2]] });
    expect(useUiStore().chapterPickerFor).toBeNull();
    await waitForText('已加入下载队列：2 话');
  });

  it('shows a load failure with retry', async () => {
    server.replyOnce(502, { code: 502, error: 'scraper-blocked' });
    await openPicker();
    expect(document.querySelector('[data-testid="chapter-error"]')?.textContent).toContain('Cloudflare');
    server.replyOnce(200, { code: 200, data: chapters });
    await click(findButton('重试'));
    await flushPromises();
    expect(chips()).toHaveLength(3);
  });

  it('keeps the dialog open when the re-download fails', async () => {
    server.replyOnce(200, { code: 200, data: chapters });
    await openPicker();
    await click(chips()[0]);
    server.replyOnce(404, { code: 404, error: 'manga-not-found' });
    await click(confirmButton());
    expect(useUiStore().chapterPickerFor).toBe('m1');
    await waitForText('漫画库中没有这部漫画');
  });
});
