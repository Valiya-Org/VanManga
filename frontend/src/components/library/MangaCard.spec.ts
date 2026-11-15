import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { mountWithApp } from '@/test/mount';
import { makeManga } from '@/test/fixtures';
import { useQueueStore } from '@/stores/queue';
import type { Manga } from '@/api/types';
import MangaCard from './MangaCard.vue';
import MangaRow from './MangaRow.vue';

enableAutoUnmount(afterEach);

const NOW = new Date(2026, 10, 14, 12, 0, 0).getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const hoursAgo = (h: number) => (NOW - h * 3_600_000) / 1000;

async function card(manga: Manga, seed?: () => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  seed?.();
  const { wrapper } = await mountWithApp(MangaCard, { props: { manga }, pinia });
  return wrapper;
}

describe('MangaCard', () => {
  it('shows title, latest chapter, relative time and the "新" badge for a recent update', async () => {
    const w = await card(
      makeManga({ manga_name: '海贼王', last_epi_name: '第1100话', updated_at: hoursAgo(2) }),
    );
    expect(w.find('h3').text()).toBe('海贼王');
    expect(w.find('h3').attributes('title')).toBe('海贼王');
    expect(w.text()).toContain('第1100话');
    expect(w.text()).toContain('2 小时前');
    expect(w.find('[data-testid="badge-new"]').exists()).toBe(true);
    expect(w.find('[data-testid="card-overlay"]').exists()).toBe(false);
  });

  it('has no "新" badge after three days', async () => {
    const w = await card(makeManga({ updated_at: hoursAgo(73), last_epi_name: 'x' }));
    expect(w.find('[data-testid="badge-new"]').exists()).toBe(false);
  });

  it('shows "自动" only while auto-update is on (download_switch 0)', async () => {
    expect((await card(makeManga({ download_switch: 0 }))).find('[data-testid="badge-auto"]').exists()).toBe(true);
    expect((await card(makeManga({ download_switch: 1 }))).find('[data-testid="badge-auto"]').exists()).toBe(false);
  });

  it('shows "尚未下载" for a manga never downloaded', async () => {
    const w = await card(makeManga({ last_epi_name: '' }));
    expect(w.text()).toContain('尚未下载');
  });

  it('shows download progress while running', async () => {
    const w = await card(makeManga({ manga_id: 'm1' }), () => {
      const q = useQueueStore();
      q.applySnapshot({
        active: { id: 't', kind: 'full-manga', mangaId: 'm1', status: 'running', enqueuedAt: 1 },
        pending: [],
      });
      q.applyProgress({ manga_id: 'm1', chapters_total: 12, chapters_done: 3, chapters_failed: 0 });
    });
    const overlay = w.find('[data-testid="card-overlay"]');
    expect(overlay.text()).toContain('下载中');
    expect(overlay.text()).toContain('3 / 12 话');
    expect(overlay.find('[data-testid="progress-bar"]').attributes('aria-valuenow')).toBe('3');
  });

  it('shows "下载中" with an indeterminate bar before the first progress event', async () => {
    const w = await card(makeManga({ manga_id: 'm1' }), () => {
      useQueueStore().applySnapshot({
        active: { id: 't', kind: 'full-manga', mangaId: 'm1', status: 'running', enqueuedAt: 1 },
        pending: [],
      });
    });
    const overlay = w.find('[data-testid="card-overlay"]');
    expect(overlay.text().trim()).toBe('下载中');
    expect(overlay.find('[data-testid="progress-bar"]').attributes('aria-valuenow')).toBeUndefined();
  });

  it('shows the queue position while waiting', async () => {
    const w = await card(makeManga({ manga_id: 'm2' }), () => {
      useQueueStore().applySnapshot({
        active: { id: 't0', kind: 'full-manga', mangaId: 'x', status: 'running', enqueuedAt: 1 },
        pending: [
          { id: 't1', kind: 'full-manga', mangaId: 'y', status: 'pending', enqueuedAt: 2 },
          { id: 't2', kind: 'redownload', mangaId: 'm2', status: 'pending', enqueuedAt: 3 },
        ],
      });
    });
    expect(w.find('[data-testid="card-overlay"]').text()).toBe('排队中 · 第 2 位');
  });

  it('falls back to the title initial when the cover fails to load', async () => {
    const w = await card(makeManga({ manga_name: '进击的巨人' }));
    await w.find('[data-testid="cover-img"]').trigger('error');
    expect(w.find('[data-testid="cover-fallback"]').text()).toBe('进');
  });
});

describe('MangaRow', () => {
  it('shows artist, chapter and the auto/manual mark', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { wrapper } = await mountWithApp(MangaRow, {
      props: { manga: makeManga({ artist_name: '尾田', last_epi_name: '第5话', download_switch: 1 }) },
      pinia,
    });
    expect(wrapper.text()).toContain('尾田');
    expect(wrapper.text()).toContain('第5话');
    expect(wrapper.text()).toContain('手动');
  });
});
