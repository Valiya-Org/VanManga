import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { mountWithApp, findButton, click, bodyText, waitForText } from '@/test/mount';
import { makeManga } from '@/test/fixtures';
import { useQueueStore } from '@/stores/queue';
import { useLibraryStore } from '@/stores/library';
import { useConfigStore } from '@/stores/config';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import type { Manga } from '@/api/types';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import AdminTokenDialog from '@/components/common/AdminTokenDialog.vue';
import MangaActionsMenu from './MangaActionsMenu.vue';

let server: FakeServer;
beforeEach(() => {
  server = fakeServer(http);
  localStorage.clear();
});
afterEach(() => server.restore());
enableAutoUnmount(afterEach);

/** The menu plus the global dialogs it relies on. */
const Harness = defineComponent({
  props: { manga: { type: Object as () => Manga, required: true } },
  setup: (props) => () => [
    h(MangaActionsMenu, { manga: props.manga }),
    h(ConfirmDialog),
    h(AdminTokenDialog),
  ],
});

async function mountMenu(manga: Manga, seed?: () => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useLibraryStore().items = [manga];
  seed?.();
  const mounted = await mountWithApp(Harness, { props: { manga }, pinia });
  return mounted;
}

async function openMenu(): Promise<void> {
  const trigger = document.querySelector('[data-testid="manga-actions"]')!;
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flushPromises();
}

function menuItem(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
    el.textContent?.includes(label),
  );
}

function busy(mangaId: string) {
  useQueueStore().applySnapshot({
    active: { id: 't', kind: 'full-manga', mangaId, status: 'running', enqueuedAt: 1 },
    pending: [],
  });
}

describe('MangaActionsMenu', () => {
  it('lists the actions for an idle manga', async () => {
    await mountMenu(makeManga({ download_switch: 0 }));
    await openMenu();
    expect(menuItem('关闭自动更新')).toBeDefined();
    expect(menuItem('选择章节重新下载')?.getAttribute('data-disabled')).toBeNull();
    expect(menuItem('删除')?.getAttribute('data-disabled')).toBeNull();
    expect(menuItem('在 Kavita 中打开')).toBeUndefined();
  });

  it('disables delete and re-download, with the reason, while busy', async () => {
    await mountMenu(makeManga({ manga_id: 'm1' }), () => busy('m1'));
    await openMenu();
    expect(menuItem('选择章节重新下载')?.hasAttribute('data-disabled')).toBe(true);
    expect(menuItem('删除')?.hasAttribute('data-disabled')).toBe(true);
    expect(menuItem('删除')?.textContent).toContain('下载中或排队中');
    expect(menuItem('关闭自动更新')?.hasAttribute('data-disabled')).toBe(false);
  });

  it('offers Kavita only when enabled and logged in', async () => {
    await mountMenu(makeManga({ kavita_url: 'http://k/series/1' }), () => {
      useConfigStore().config = { kavitaEnabled: true, kavitaExposeUrl: 'http://k', adminRequired: false };
      localStorage.setItem('vanmanga.kavita', JSON.stringify({ loginUrl: 'http://k/login?apiKey=x' }));
    });
    // The session store reads storage when first used.
    expect(useSessionStore().kavitaLoggedIn).toBe(true);
    await openMenu();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await click(menuItem('在 Kavita 中打开'));
    expect(open).toHaveBeenCalledWith('http://k/series/1', '_blank', 'noopener');
  });

  it('toggles auto-update', async () => {
    await mountMenu(makeManga({ download_switch: 0 }));
    server.reply(200, { code: 200, data: { currentDownloadStatus: 1 } });
    await openMenu();
    await click(menuItem('关闭自动更新'));
    expect(server.lastRequest()?.url).toBe('library/m1/auto-update');
    expect(useLibraryStore().byId('m1')?.download_switch).toBe(1);
    await waitForText('已关闭自动更新');
  });

  it('opens the chapter picker', async () => {
    await mountMenu(makeManga());
    await openMenu();
    await click(menuItem('选择章节重新下载'));
    expect(useUiStore().chapterPickerFor).toBe('m1');
  });

  it('deletes after confirmation and the admin token', async () => {
    await mountMenu(makeManga({ manga_name: '要删的' }));
    await openMenu();
    await click(menuItem('删除'));
    expect(bodyText()).toContain('删除《要删的》？');
    expect(bodyText()).toContain('删除已下载的文件');

    server.replyOnce(401, { code: 401, error: 'admin-token-required' });
    server.replyOnce(200, { code: 200, data: true });
    await click(document.querySelector('[data-testid="confirm-ok"]'));
    expect(bodyText()).toContain('需要管理员口令');
    const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    input.value = 'secret';
    input.dispatchEvent(new Event('input'));
    await flushPromises();
    await click(findButton('确认'));
    await flushPromises();
    expect(server.requests.at(-1)?.method).toBe('delete');
    expect(useLibraryStore().items).toHaveLength(0);
    await waitForText('已删除');
  });

  it('cancelling the confirmation sends nothing', async () => {
    await mountMenu(makeManga());
    await openMenu();
    await click(menuItem('删除'));
    await click(findButton('取消'));
    expect(server.requests).toHaveLength(0);
    expect(useLibraryStore().items).toHaveLength(1);
  });

  it('shows the Chinese error when delete fails', async () => {
    await mountMenu(makeManga());
    server.reply(409, { code: 409, error: 'manga-busy' });
    await openMenu();
    await click(menuItem('删除'));
    await click(document.querySelector('[data-testid="confirm-ok"]'));
    await flushPromises();
    await waitForText('这部漫画正在下载或排队中');
    expect(useLibraryStore().items).toHaveLength(1);
  });
});
