import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from './app';

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('defaults isLogin to false', () => {
    const store = useAppStore();
    expect(store.isLogin).toBe(false);
  });

  it('setIsPhone updates isPhone', () => {
    const store = useAppStore();
    store.setIsPhone(true);
    expect(store.isPhone).toBe(true);
    store.setIsPhone(false);
    expect(store.isPhone).toBe(false);
  });

  it('setIsLogin updates isLogin', () => {
    const store = useAppStore();
    store.setIsLogin(true);
    expect(store.isLogin).toBe(true);
  });
});
