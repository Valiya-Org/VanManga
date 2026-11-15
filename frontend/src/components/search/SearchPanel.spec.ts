import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { mountWithApp, findButton, click, bodyText, waitForText } from '@/test/mount';
import { makeCandidate, makeManga } from '@/test/fixtures';
import { useMangaSearch, type MangaSearch } from '@/composables/useMangaSearch';
import { useLibraryStore } from '@/stores/library';
import { useUiStore } from '@/stores/ui';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import SearchPanel from './SearchPanel.vue';

let server: FakeServer;
beforeEach(() => (server = fakeServer(http)));
afterEach(() => server.restore());
enableAutoUnmount(afterEach);

let search: MangaSearch;
const Harness = defineComponent({
  setup() {
    search = useMangaSearch();
    return () => [h(SearchPanel, { search }), h(ConfirmDialog)];
  },
});

const ok = (data: unknown) => ({ code: 200, data });

async function openWithResults(candidates = [makeCandidate({ manga_id: 'c1', manga_name: '鬼灭之刃' })]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const mounted = await mountWithApp(Harness, { pinia });
  useUiStore().searchOpen = true;
  server.replyOnce(200, ok(candidates));
  await search.search('鬼灭');
  await flushPromises();
  return mounted;
}

function row(id: string): Element {
  return document.querySelector(`[data-testid="search-result-${id}"]`)!;
}

function addButton(id: string): HTMLButtonElement {
  return row(id).querySelector('button')!;
}

describe('SearchPanel', () => {
  it('lists results with title, artist and newest chapter', async () => {
    await openWithResults();
    expect(row('c1').textContent).toContain('鬼灭之刃');
    expect(row('c1').textContent).toContain('Artist');
    expect(row('c1').textContent).toContain('第1话');
    expect(addButton('c1').textContent?.trim()).toBe('添加');
  });

  it('adds a candidate: success toast and the row becomes "已在库中"', async () => {
    await openWithResults();
    server.replyOnce(200, ok({ status: 'added', manga: makeManga({ manga_id: 'c1', manga_name: '鬼灭之刃' }) }));
    await click(addButton('c1'));
    expect(server.lastBody()).toEqual({ manga_id: 'c1', source: 'dgmanga' });
    expect(useLibraryStore().byId('c1')).toBeDefined();
    expect(addButton('c1').textContent?.trim()).toBe('已在库中');
    expect(addButton('c1').disabled).toBe(true);
    await waitForText('已添加《鬼灭之刃》');
  });

  it('shows "已在库中" for candidates already in the library', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useLibraryStore().items = [makeManga({ manga_id: 'c1' })];
    await mountWithApp(Harness, { pinia });
    useUiStore().searchOpen = true;
    server.replyOnce(200, ok([makeCandidate({ manga_id: 'c1' }), makeCandidate({ manga_id: 'c2' })]));
    await search.search('x');
    await flushPromises();
    expect(addButton('c1').textContent?.trim()).toBe('已在库中');
    expect(addButton('c2').textContent?.trim()).toBe('添加');
  });

  it('asks about similar titles and re-submits when confirmed', async () => {
    await openWithResults();
    server.replyOnce(409, { code: 409, error: 'duplicate', data: { duplicates: ['鬼灭之刃 外传'] } });
    await click(addButton('c1'));
    expect(bodyText()).toContain('库中已有相似的漫画');
    expect(document.querySelector('[data-testid="confirm-items"]')?.textContent).toContain('鬼灭之刃 外传');

    server.replyOnce(200, ok({ status: 'added', manga: makeManga({ manga_id: 'c1' }) }));
    await click(findButton('仍然添加'));
    await flushPromises();
    expect(server.lastBody()).toMatchObject({ manga_id: 'c1', submit_sign: '1' });
    expect(useLibraryStore().byId('c1')).toBeDefined();
  });

  it('cancelling the similar-title question adds nothing', async () => {
    await openWithResults();
    server.replyOnce(409, { code: 409, error: 'duplicate', data: { duplicates: ['x'] } });
    await click(addButton('c1'));
    await click(findButton('取消'));
    await flushPromises();
    expect(server.requests).toHaveLength(2); // search + first add
    expect(useLibraryStore().byId('c1')).toBeUndefined();
    expect(addButton('c1').textContent?.trim()).toBe('添加');
  });

  it('offers a one-click re-search when the search expired', async () => {
    await openWithResults();
    server.replyOnce(410, { code: 410, error: 'search-expired' });
    await click(addButton('c1'));
    expect(document.querySelector('[data-testid="search-expired"]')?.textContent).toContain(
      '搜索结果已过期',
    );
    server.replyOnce(200, ok([makeCandidate({ manga_id: 'c1' })]));
    await click(findButton('重新搜索'));
    await flushPromises();
    expect(server.lastRequest()?.params).toEqual({ q: '鬼灭' });
    expect(document.querySelector('[data-testid="search-expired"]')).toBeNull();
  });

  it('marks the row when the server says it is already in the library', async () => {
    await openWithResults();
    server.replyOnce(409, { code: 409, error: 'already-in-library' });
    await click(addButton('c1'));
    expect(addButton('c1').textContent?.trim()).toBe('已在库中');
  });

  it('shows the no-result state', async () => {
    await openWithResults([]);
    expect(document.querySelector('[data-testid="search-empty"]')?.textContent).toContain('鬼灭');
  });

  it('shows a search error with retry', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await mountWithApp(Harness, { pinia });
    useUiStore().searchOpen = true;
    server.replyOnce(502, { code: 502, error: 'scraper-failed' });
    await search.search('x');
    await flushPromises();
    expect(document.querySelector('[data-testid="search-error"]')?.textContent).toContain('抓取源站失败');
    server.replyOnce(200, ok([makeCandidate()]));
    await click(findButton('重试'));
    await flushPromises();
    expect(document.querySelector('[data-testid="search-result-c1"]')).not.toBeNull();
  });

  it('closing cancels the search in flight', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await mountWithApp(Harness, { pinia });
    useUiStore().searchOpen = true;
    const held = server.replyDeferred();
    void search.search('slow');
    await held.received;
    await flushPromises();
    expect(search.loading.value).toBe(true);
    await click(findButton('关闭'));
    expect(useUiStore().searchOpen).toBe(false);
    expect(search.loading.value).toBe(false);
  });
});
