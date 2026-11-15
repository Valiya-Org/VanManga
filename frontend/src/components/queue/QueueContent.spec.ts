import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { mountWithApp } from '@/test/mount';
import { makeManga } from '@/test/fixtures';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { useRealtimeStore } from '@/stores/realtime';
import QueueContent from './QueueContent.vue';

enableAutoUnmount(afterEach);

async function mountQueue(seed: () => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  seed();
  return (await mountWithApp(QueueContent, { pinia })).wrapper;
}

describe('QueueContent', () => {
  it('shows the empty state', async () => {
    const w = await mountQueue(() => {});
    expect(w.find('[data-testid="queue-empty"]').text()).toBe('当前没有下载任务');
    expect(w.find('[data-testid="queue-active"]').exists()).toBe(false);
  });

  it('shows the running task with finished chapters and progress', async () => {
    const w = await mountQueue(() => {
      useLibraryStore().items = [
        makeManga({ manga_id: 'm1', manga_name: '一拳超人', last_epi_name: '第3话 拳' }),
      ];
      const q = useQueueStore();
      q.applySnapshot({
        active: { id: 't', kind: 'full-manga', mangaId: 'm1', status: 'running', enqueuedAt: 1 },
        pending: [],
      });
      q.applyProgress({ manga_id: 'm1', chapters_total: 10, chapters_done: 3, chapters_failed: 0 });
    });
    const active = w.find('[data-testid="queue-active"]');
    expect(active.text()).toContain('一拳超人');
    // Counts finished chapters, like the card's "下载中 3 / 10 话".
    expect(active.text()).toContain('已完成 3 / 10 话');
    // No chapter name: the API has no "chapter in progress" field, and
    // last_epi_name is the newest finished chapter, not the current one.
    expect(active.text()).not.toContain('当前');
    expect(active.text()).not.toContain('第3话 拳');
    const bar = active.find('[data-testid="progress-bar"]');
    expect(bar.attributes('aria-valuenow')).toBe('3');
    expect(bar.attributes('aria-label')).toBe('《一拳超人》下载进度');
  });

  it('lists waiting tasks in order with what they will do', async () => {
    const w = await mountQueue(() => {
      useLibraryStore().items = [makeManga({ manga_id: 'a', manga_name: 'A 漫画' })];
      useQueueStore().applySnapshot({
        active: { id: 'r', kind: 'rezip', status: 'running', enqueuedAt: 1 },
        pending: [
          { id: '1', kind: 'redownload', mangaId: 'a', status: 'pending', enqueuedAt: 2 },
          { id: '2', kind: 'full-manga', mangaId: 'gone', status: 'pending', enqueuedAt: 3 },
        ],
      });
    });
    expect(w.find('[data-testid="queue-active"]').text()).toContain('重新打包全部漫画');
    expect(w.find('[data-testid="queue-active"] [data-testid="progress-bar"]').exists()).toBe(false);
    const items = w.findAll('[data-testid="queue-pending"] li');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('A 漫画');
    expect(items[0].text()).toContain('重新下载所选章节');
    expect(items[1].text()).toContain('gone');
    expect(items[1].text()).toContain('下载全部新章节');
  });

  it('shows the connection state', async () => {
    let w = await mountQueue(() => useRealtimeStore().markConnected());
    expect(w.find('[data-testid="queue-connection"]').text()).toBe('实时连接正常');
    w.unmount();
    w = await mountQueue(() => {
      const r = useRealtimeStore();
      r.markConnected();
      r.markDisconnected('transport close');
    });
    expect(w.find('[data-testid="queue-connection"]').text()).toContain('实时连接已断开');
  });
});
