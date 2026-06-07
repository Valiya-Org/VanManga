import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '@/stores/app';
import { useResponsive } from './useResponsive';

function setWidth(px: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: px,
    configurable: true,
  });
}

describe('useResponsive', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sets isPhone=true immediately when width < 993', () => {
    setWidth(500);
    const store = useAppStore();
    const stop = useResponsive();
    expect(store.isPhone).toBe(true);
    stop();
  });

  it('sets isPhone=false immediately when width >= 993', () => {
    setWidth(1200);
    const store = useAppStore();
    const stop = useResponsive();
    expect(store.isPhone).toBe(false);
    stop();
  });

  it('updates store on window resize', () => {
    setWidth(1200);
    const store = useAppStore();
    const stop = useResponsive();
    expect(store.isPhone).toBe(false);
    setWidth(400);
    window.dispatchEvent(new Event('resize'));
    expect(store.isPhone).toBe(true);
    stop();
  });

  it('stop() removes the resize listener', () => {
    setWidth(1200);
    const store = useAppStore();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const stop = useResponsive();
    stop();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });
});
