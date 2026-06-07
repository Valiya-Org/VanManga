import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/kavita', () => ({
  kavitaStatus: vi.fn(() => Promise.resolve({ code: 200, data: null })),
}));
vi.mock('@/utils/ui', () => ({
  showLoading: vi.fn(() => ({ close: vi.fn() })),
  messageError: vi.fn(),
}));

import { kavitaStatus } from '@/api/kavita';
import App from './App.vue';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
  (window as unknown as { MANGA_BASE_URL?: string }).MANGA_BASE_URL = 'http://x';
});

describe('App init', () => {
  it('renders router-view outlet', () => {
    const wrapper = mount(App, {
      global: { stubs: { 'router-view': true } },
    });
    expect(wrapper.find('#app').exists()).toBe(true);
  });

  it('checks server status when no cached serverStatus', async () => {
    mount(App, { global: { stubs: { 'router-view': true } } });
    await Promise.resolve();
    expect(kavitaStatus).toHaveBeenCalledTimes(1);
  });

  it('skips server check when fresh cache exists', async () => {
    localStorage.setItem('serverStatus', 'true');
    localStorage.setItem(
      'serverStatusLastCheckTime',
      JSON.stringify(Date.now()),
    );
    mount(App, { global: { stubs: { 'router-view': true } } });
    await Promise.resolve();
    expect(kavitaStatus).not.toHaveBeenCalled();
  });
});
