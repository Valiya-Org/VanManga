import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';

// The transport is faked; the dispatcher and stores run for real.
const listeners = new Map<string, (...a: unknown[]) => void>();
const socketStub = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn((e: string, h: (...a: unknown[]) => void) => listeners.set(e, h)),
  off: vi.fn((e: string) => listeners.delete(e)),
};
vi.mock('socket.io-client', () => ({ io: () => socketStub }));

import { http } from '@/api/http';
import { fakeServer, type FakeServer } from '@/test/fake-server';
import { useConfigStore } from '@/stores/config';
import { useQueueStore } from '@/stores/queue';
import { useLibraryStore } from '@/stores/library';
import App from './App.vue';
import { routes } from './router';

let server: FakeServer;
beforeEach(() => {
  server = fakeServer(http);
  listeners.clear();
  socketStub.connect.mockClear();
  socketStub.disconnect.mockClear();
});
afterEach(() => server.restore());
enableAutoUnmount(afterEach);

async function mountApp(path = '/') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return wrapper;
}

describe('App shell', () => {
  it('renders the routed view inside the Nuxt UI app wrapper', async () => {
    const wrapper = await mountApp('/settings');
    expect(wrapper.find('[data-testid="settings-view"]').exists()).toBe(true);
  });

  it('loads config, connects the socket once and routes events to stores', async () => {
    server.reply(200, {
      code: 200,
      data: { kavitaEnabled: true, kavitaExposeUrl: 'http://k', adminRequired: true },
    });
    await mountApp();

    expect(useConfigStore().adminRequired).toBe(true);
    expect(socketStub.connect).toHaveBeenCalledTimes(1);

    listeners.get('queue_updated')!({
      active: null,
      pending: [{ id: 't', kind: 'full-manga', mangaId: 'm', status: 'pending', enqueuedAt: 1 }],
    });
    expect(useQueueStore().count).toBe(1);
  });

  it('loads library and queue at startup without waiting for the socket', async () => {
    server.reply(200, { code: 200, data: [] });
    await mountApp();
    const urls = server.requests.map((r) => r.url);
    expect(urls).toEqual(expect.arrayContaining(['config', 'library', 'download/queue']));
    expect(listeners.has('connect')).toBe(true);
    expect(useLibraryStore().loaded).toBe(true);
    expect(useQueueStore().loaded).toBe(true);
  });

  it('unbinds and disconnects on unmount', async () => {
    const wrapper = await mountApp();
    wrapper.unmount();
    expect(listeners.size).toBe(0);
    expect(socketStub.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('AppShell', () => {
  it('shows the logo, the search box and an outlined "队列" button when idle', async () => {
    const wrapper = await mountApp();
    expect(wrapper.find('[data-testid="brand-logo"]').text()).toBe('VanManga');
    expect(wrapper.find('input[data-testid="topbar-search"]').attributes('placeholder')).toBe(
      '搜索并添加漫画…',
    );
    const queueButton = wrapper.find('[data-testid="queue-button"]');
    expect(queueButton.text()).toBe('队列');
    expect(queueButton.classes()).not.toContain('vm-gradient-btn');
    expect(wrapper.find('[data-testid="library-view"]').exists()).toBe(true);
  });

  it('shows the queue count on the gradient button and the phone tab badge', async () => {
    const wrapper = await mountApp();
    listeners.get('queue_updated')!({
      active: { id: 'a', kind: 'full-manga', mangaId: 'm', status: 'running', enqueuedAt: 1 },
      pending: [{ id: 'b', kind: 'full-manga', mangaId: 'n', status: 'pending', enqueuedAt: 2 }],
    });
    await flushPromises();
    const queueButton = wrapper.find('[data-testid="queue-button"]');
    expect(queueButton.text()).toBe('队列 2');
    expect(queueButton.classes()).toContain('vm-gradient-btn');
    expect(wrapper.find('[data-testid="queue-tab-badge"]').text()).toBe('2');

    await queueButton.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('下载队列 · 2');
  });

  it('shows the offline notice when the realtime connection drops', async () => {
    const wrapper = await mountApp();
    expect(wrapper.find('[data-testid="offline-notice"]').exists()).toBe(false);
    listeners.get('connect')!();
    listeners.get('disconnect')!('transport close');
    await flushPromises();
    expect(wrapper.find('[data-testid="offline-notice"]').text()).toBe('实时连接已断开，正在重连…');
  });

  it('searches from the top bar and opens the results panel', async () => {
    const wrapper = await mountApp();
    server.reply(200, {
      code: 200,
      data: [{ manga_id: 'c1', manga_name: '结果一', artist_name: 'A', newest_epi: '第1话', thumbnail: '/t', source: 'dgmanga' }],
    });
    await wrapper.find('input[data-testid="topbar-search"]').setValue('结果');
    await wrapper.find('form[role="search"]').trigger('submit');
    await flushPromises();
    expect(server.lastRequest()?.url).toBe('scraper/dgmanga/search');
    expect(document.querySelector('[data-testid="search-result-c1"]')?.textContent).toContain('结果一');
  });
});
