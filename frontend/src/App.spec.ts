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
