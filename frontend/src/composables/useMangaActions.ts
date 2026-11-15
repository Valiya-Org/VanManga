import { useToast } from '@nuxt/ui/composables';
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { isApiError } from '@/api/errors';
import type { Manga } from '@/api/types';
import { errorMessage } from '@/errors/messages';
import { useConfigStore } from '@/stores/config';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';

export const BUSY_REASON = '下载中或排队中，暂不可用';

export interface MangaActions {
  /** Downloading or queued: delete and re-download are disabled. */
  busy: ComputedRef<boolean>;
  /** Auto-update is on (`download_switch === 0`, contract §2). */
  autoUpdate: ComputedRef<boolean>;
  /** URL for "在 Kavita 中打开", or null when the item must not be shown. */
  kavitaUrl: ComputedRef<string | null>;
  toggleAutoUpdate(): Promise<void>;
  chooseChapters(): void;
  openInKavita(): void;
  remove(): Promise<void>;
}

/**
 * The per-manga actions shared by the library card and row, with their
 * toasts. Components call these instead of the api or stores directly.
 */
export function useMangaActions(manga: MaybeRefOrGetter<Manga>): MangaActions {
  const library = useLibraryStore();
  const queue = useQueueStore();
  const config = useConfigStore();
  const session = useSessionStore();
  const ui = useUiStore();
  const toast = useToast();

  const id = () => toValue(manga).manga_id;
  const busy = computed(() => queue.isMangaBusy(id()));
  const autoUpdate = computed(() => toValue(manga).download_switch === 0);
  const kavitaUrl = computed(() => {
    if (!config.kavitaEnabled || !session.kavitaLoggedIn) return null;
    return toValue(manga).kavita_url ?? session.kavitaLoginUrl;
  });

  function fail(err: unknown): void {
    const text = errorMessage(err);
    if (text) toast.add({ title: text, color: 'error' });
  }

  async function toggleAutoUpdate(): Promise<void> {
    try {
      const next = await library.toggleAutoUpdate(id());
      toast.add({
        title: next === 0 ? '已开启自动更新' : '已关闭自动更新',
        description: toValue(manga).manga_name,
        color: 'success',
      });
    } catch (err) {
      fail(err);
    }
  }

  function chooseChapters(): void {
    if (busy.value) return;
    ui.openChapterPicker(id());
  }

  function openInKavita(): void {
    if (kavitaUrl.value) window.open(kavitaUrl.value, '_blank', 'noopener');
  }

  async function remove(): Promise<void> {
    if (busy.value) return;
    const name = toValue(manga).manga_name;
    const ok = await ui.confirm({
      title: `删除《${name}》？`,
      description: '将从漫画库中移除，并删除已下载的文件。此操作无法撤销。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await library.remove(id());
      toast.add({ title: '已删除', description: name, color: 'success' });
    } catch (err) {
      // Cancelling the admin-token dialog aborts silently.
      if (isApiError(err) && err.isAdminTokenError) return;
      fail(err);
    }
  }

  return { busy, autoUpdate, kavitaUrl, toggleAutoUpdate, chooseChapters, openInKavita, remove };
}
