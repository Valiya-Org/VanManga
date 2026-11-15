import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { mountWithApp, findButton, click } from '@/test/mount';
import { useUiStore } from '@/stores/ui';
import ConfirmDialog from './ConfirmDialog.vue';
import ProgressBar from './ProgressBar.vue';

enableAutoUnmount(afterEach);

describe('ConfirmDialog', () => {
  it('shows the request and resolves with the chosen button', async () => {
    await mountWithApp(ConfirmDialog);
    const ui = useUiStore();
    const answer = ui.confirm({
      title: '删除漫画？',
      description: '会删除已下载文件',
      items: ['A', 'B'],
      confirmLabel: '删除',
      danger: true,
    });
    await flushPromises();
    expect(document.body.textContent).toContain('删除漫画？');
    expect(document.body.textContent).toContain('会删除已下载文件');
    expect(document.querySelectorAll('[data-testid="confirm-items"] li')).toHaveLength(2);
    await click(findButton('删除'));
    await expect(answer).resolves.toBe(true);
  });

  it('cancel resolves false', async () => {
    await mountWithApp(ConfirmDialog);
    const answer = useUiStore().confirm({ title: 'T', confirmLabel: '好' });
    await flushPromises();
    await click(findButton('取消'));
    await expect(answer).resolves.toBe(false);
  });
});

describe('ProgressBar', () => {
  it('shows a determinate percentage', async () => {
    const { wrapper } = await mountWithApp(ProgressBar, { props: { done: 1, total: 4 } });
    const bar = wrapper.find('[data-testid="progress-bar"]');
    expect(bar.attributes('aria-valuenow')).toBe('1');
    expect(bar.find('div').attributes('style')).toContain('width: 25%');
  });

  it('is indeterminate without a total', async () => {
    const { wrapper } = await mountWithApp(ProgressBar, { props: { done: 0, total: null } });
    const bar = wrapper.find('[data-testid="progress-bar"]');
    expect(bar.attributes('aria-valuenow')).toBeUndefined();
    expect(bar.find('div').classes()).toContain('animate-pulse');
  });
});
