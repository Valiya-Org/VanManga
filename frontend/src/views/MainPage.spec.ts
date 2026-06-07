import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/composables/useSocket', () => ({
  useSocket: vi.fn(() => ({
    socket: {},
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

import { useAppStore } from '@/stores/app';
import MainPage from './MainPage.vue';

const stubs = {
  'router-view': true,
  'el-container': { template: '<div><slot /></div>' },
  'el-header': { template: '<div><slot /></div>' },
  'el-main': { template: '<div><slot /></div>' },
  'el-menu': { template: '<div class="el-menu"><slot /></div>' },
  'el-menu-item': { template: '<div class="el-menu-item"><slot /></div>' },
  'el-tag': { template: '<div><slot /></div>' },
  'el-icon': true,
  'van-nav-bar': { template: '<div><slot name="title" /></div>' },
  'van-tabbar': { template: '<div class="van-tabbar"><slot /></div>' },
  'van-tabbar-item': { template: '<div class="van-tabbar-item"><slot /></div>' },
  'van-icon': true,
  Announcement: true,
  VPullButton: true,
};

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('MainPage', () => {
  it('renders desktop el-menu when not phone', () => {
    useAppStore().setIsPhone(false);
    const wrapper = mount(MainPage, { global: { stubs } });
    expect(wrapper.find('.el-menu').exists()).toBe(true);
    expect(wrapper.find('.van-tabbar').exists()).toBe(false);
  });

  it('renders mobile van-tabbar when phone', () => {
    useAppStore().setIsPhone(true);
    const wrapper = mount(MainPage, { global: { stubs } });
    expect(wrapper.find('.van-tabbar').exists()).toBe(true);
    expect(wrapper.find('.el-menu').exists()).toBe(false);
  });
});
