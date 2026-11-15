import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { useQueueStore, type DownloadProgress } from '@/stores/queue';

export type MangaQueueState =
  | { kind: 'idle' }
  /** Running now; `progress` is null until the first download_progress. */
  | { kind: 'downloading'; progress: DownloadProgress | null }
  /** Waiting; `position` is 1-based among the pending tasks. */
  | { kind: 'queued'; position: number };

/** Where a manga stands in the download queue (shared by card and row). */
export function useMangaStatus(mangaId: MaybeRefOrGetter<string>): ComputedRef<MangaQueueState> {
  const queue = useQueueStore();
  return computed(() => {
    const id = toValue(mangaId);
    if (queue.active?.mangaId === id) {
      return { kind: 'downloading', progress: queue.progressOf(id) };
    }
    const index = queue.pending.findIndex((t) => t.mangaId === id);
    if (index >= 0) return { kind: 'queued', position: index + 1 };
    return { kind: 'idle' };
  });
}
