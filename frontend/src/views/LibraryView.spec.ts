import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { mountWithApp, findButton, click } from '@/test/mount';
import { makeManga } from '@/test/fixtures';
import { useLibraryStore } from '@/stores/library';
import { LIBRARY_VIEW_STORAGE_KEY } from '@/composables/useLibraryViewMode';
import LibraryView from './LibraryView.vue';

let server: FakeServer;
beforeEach(() => {
  server = fakeServer(http);
  localStorage.clear();
});
afterEach(() => server.restore());
enableAutoUnmount(afterEach);

async function mountLoaded(items = [makeManga({ manga_id: 'a', manga_name: 'Alpha', updated_at: 2 }), makeManga({ manga_id: 'b', manga_name: 'Beta', updated_at: 3 })]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  server.reply(200, { code: 200, data: items });
  await useLibraryStore().load();
  return mountWithApp(LibraryView, { pinia });
}

describe('LibraryView', () => {
  it('shows the count and the cards, newest first', async () => {
    const { wrapper } = await mountLoaded();
    expect(wrapper.text()).toContain('共 2 部 · 按最近更新');
    const cards = wrapper.findAll('[data-testid^="manga-card-"]');
    expect(cards.map((c) => c.attributes('data-testid'))).toEqual(['manga-card-b', 'manga-card-a']);
  });

  it('filters within the library and reports no match', async () => {
    const { wrapper } = await mountLoaded();
    await wrapper.find('input[data-testid="library-filter"]').setValue('alp');
    expect(wrapper.findAll('[data-testid^="manga-card-"]')).toHaveLength(1);
    await wrapper.find('input[data-testid="library-filter"]').setValue('zzz');
    expect(wrapper.find('[data-testid="library-no-match"]').text()).toBe('没有匹配的漫画');
  });

  it('shows the empty state', async () => {
    const { wrapper } = await mountLoaded([]);
    expect(wrapper.find('[data-testid="library-empty"]').text()).toBe('还没有漫画，在上方搜索并添加');
  });

  it('switches to the list view and remembers it', async () => {
    const { wrapper } = await mountLoaded();
    await click(findButton('列表'));
    expect(wrapper.find('[data-testid="library-list"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="manga-row-"]')).toHaveLength(2);
    // Phones keep the update time on its own line (hidden from sm up).
    const phoneTime = wrapper.findAll('[data-testid="row-updated-phone"]');
    expect(phoneTime).toHaveLength(2);
    expect(phoneTime[0].text()).not.toBe('');
    expect(localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)).toBe('list');
  });

  it('starts in the remembered view', async () => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, 'list');
    const { wrapper } = await mountLoaded();
    expect(wrapper.find('[data-testid="library-list"]').exists()).toBe(true);
  });

  it('shows the load error with a working retry', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    server.networkError();
    await useLibraryStore().load();
    const { wrapper } = await mountWithApp(LibraryView, { pinia });
    expect(wrapper.find('[data-testid="library-error"]').text()).toContain('无法连接服务器');
    expect(wrapper.find('[data-testid="library-empty"]').exists()).toBe(false);

    server.reply(200, { code: 200, data: [makeManga()] });
    await click(findButton('重试'));
    await flushPromises();
    expect(wrapper.find('[data-testid="library-error"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="manga-card-"]')).toHaveLength(1);
  });
});
