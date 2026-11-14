import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getQueue } from '@/api/endpoints';
import type { ApiError } from '@/api/errors';
import { toApiError } from '@/api/http';
import type {
  DownloadCompletedEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
  QueueSnapshot,
  TaskSummary,
} from '@/api/types';

/** Chapter-level progress of a running download. */
export interface DownloadProgress {
  mangaId: string;
  kind: 'full-manga' | 'redownload';
  /** `null` until the first `download_progress` arrives (it may never: a run
   *  with nothing to download goes straight to `download_completed`). */
  total: number | null;
  done: number;
  failed: number;
}

export const useQueueStore = defineStore('queue', () => {
  const active = ref<TaskSummary | null>(null);
  /** Waiting tasks, in execution order. */
  const pending = ref<TaskSummary[]>([]);
  const loaded = ref(false);
  const loadError = ref<ApiError | null>(null);
  /** Progress by manga id (only the running manga in practice). */
  const progress = ref<Record<string, DownloadProgress>>({});
  /** The most recent `download_completed` payload (for a toast, say). */
  const lastCompleted = ref<DownloadCompletedEvent | null>(null);
  /** `Date.now()` of the last `scan_completed` (rezip finished). */
  const lastScanCompletedAt = ref<number | null>(null);

  /** Active + pending, for the queue button badge. */
  const count = computed(() => (active.value ? 1 : 0) + pending.value.length);

  /** Progress of the running task, or null (none running, rezip, not started). */
  const activeProgress = computed<DownloadProgress | null>(() => {
    const id = active.value?.mangaId;
    return id ? (progress.value[id] ?? null) : null;
  });

  function progressOf(mangaId: string): DownloadProgress | null {
    return progress.value[mangaId] ?? null;
  }

  function isMangaBusy(mangaId: string): boolean {
    return (
      active.value?.mangaId === mangaId || pending.value.some((t) => t.mangaId === mangaId)
    );
  }

  /** `GET /api/download/queue`. Never throws; failures land in `loadError`. */
  async function load(): Promise<void> {
    try {
      applySnapshot(await getQueue());
      loaded.value = true;
      loadError.value = null;
    } catch (err) {
      loadError.value = toApiError(err);
    }
  }

  // ------------------------------------------------------------ socket

  /** `queue_updated`: the payload replaces the queue state. */
  function applySnapshot(s: QueueSnapshot): void {
    active.value = s.active;
    pending.value = s.pending;
    const keep = s.active?.mangaId;
    for (const id of Object.keys(progress.value)) {
      if (id !== keep) delete progress.value[id];
    }
  }

  function applyStarted(e: DownloadStartedEvent): void {
    progress.value[e.manga_id] = {
      mangaId: e.manga_id,
      kind: e.kind,
      total: null,
      done: 0,
      failed: 0,
    };
  }

  function applyProgress(e: DownloadProgressEvent): void {
    const kind =
      progress.value[e.manga_id]?.kind ??
      (active.value?.kind === 'redownload' ? 'redownload' : 'full-manga');
    progress.value[e.manga_id] = {
      mangaId: e.manga_id,
      kind,
      total: e.chapters_total,
      done: e.chapters_done,
      failed: e.chapters_failed,
    };
  }

  function applyCompleted(e: DownloadCompletedEvent): void {
    delete progress.value[e.manga_id];
    lastCompleted.value = e;
  }

  function applyScanCompleted(): void {
    lastScanCompletedAt.value = Date.now();
  }

  return {
    active,
    pending,
    loaded,
    loadError,
    progress,
    lastCompleted,
    lastScanCompletedAt,
    count,
    activeProgress,
    progressOf,
    isMangaBusy,
    load,
    applySnapshot,
    applyStarted,
    applyProgress,
    applyCompleted,
    applyScanCompleted,
  };
});
