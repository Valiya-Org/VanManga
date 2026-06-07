import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const elNotification = vi.fn();
const elMessageError = vi.fn();
const elLoadingService = vi.fn(() => ({ close: vi.fn() }));
const elMessageBoxConfirm = vi.fn(() => Promise.resolve());

vi.mock('element-plus', () => ({
  ElNotification: (opts: unknown) => elNotification(opts),
  ElMessage: { error: (m: unknown) => elMessageError(m) },
  ElLoading: { service: (opts: unknown) => elLoadingService(opts) },
  ElMessageBox: { confirm: (...a: unknown[]) => elMessageBoxConfirm(...a) },
}));

const showNotify = vi.fn();
const showLoadingToast = vi.fn(() => ({ close: vi.fn() }));
const showConfirmDialog = vi.fn(() => Promise.resolve());
const closeToast = vi.fn();

vi.mock('vant', () => ({
  showNotify: (opts: unknown) => showNotify(opts),
  showLoadingToast: (opts: unknown) => showLoadingToast(opts),
  showConfirmDialog: (opts: unknown) => showConfirmDialog(opts),
  closeToast: () => closeToast(),
}));

import { useAppStore } from '@/stores/app';
import { notifySuccess, notifyError, showLoading, confirmDialog } from './ui';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('ui helpers — desktop (isPhone=false)', () => {
  beforeEach(() => {
    useAppStore().setIsPhone(false);
  });

  it('notifySuccess uses ElNotification', () => {
    notifySuccess('t', 'm');
    expect(elNotification).toHaveBeenCalledTimes(1);
    expect(showNotify).not.toHaveBeenCalled();
  });

  it('notifyError uses ElNotification', () => {
    notifyError('t', 'm');
    expect(elNotification).toHaveBeenCalledTimes(1);
  });

  it('showLoading uses ElLoading.service and returns a closeable handle', () => {
    const h = showLoading('loading...');
    expect(elLoadingService).toHaveBeenCalledTimes(1);
    expect(typeof h.close).toBe('function');
  });

  it('confirmDialog uses ElMessageBox.confirm', async () => {
    await confirmDialog({ title: 't', message: 'm' });
    expect(elMessageBoxConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ui helpers — mobile (isPhone=true)', () => {
  beforeEach(() => {
    useAppStore().setIsPhone(true);
  });

  it('notifySuccess uses vant showNotify', () => {
    notifySuccess('t', 'm');
    expect(showNotify).toHaveBeenCalledTimes(1);
    expect(elNotification).not.toHaveBeenCalled();
  });

  it('showLoading uses vant showLoadingToast', () => {
    const h = showLoading('loading...');
    expect(showLoadingToast).toHaveBeenCalledTimes(1);
    expect(typeof h.close).toBe('function');
  });

  it('confirmDialog uses vant showConfirmDialog', async () => {
    await confirmDialog({ title: 't', message: 'm' });
    expect(showConfirmDialog).toHaveBeenCalledTimes(1);
  });
});
