import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as api from '@/api/endpoints';
import { isApiError, type ApiError } from '@/api/errors';
import { toApiError } from '@/api/http';
import type {
  AlreadyInLibraryData,
  Chapter,
  ChapterCompletedEvent,
  DmcaAlertEvent,
  DownloadCompletedEvent,
  DuplicateData,
  Manga,
  SearchCandidate,
  TaskRef,
} from '@/api/types';
import { useSessionStore } from './session';

/** Result of {@link useLibraryStore}'s `add`. Every expected branch is a
 *  value, not an exception; only unexpected failures reject. */
export type AddOutcome =
  | { status: 'added'; manga: Manga }
  | { status: 'cancelled' }
  /** Already in the library; `manga` is the current record when the server sent it. */
  | { status: 'already-in-library'; manga: Manga | null }
  /** The search cache dropped the candidate: offer "search again". */
  | { status: 'search-expired' };

export interface AddOptions {
  /** Asked when the server reports similarly named manga. Resolve `true`
   *  to add anyway, `false` to cancel. */
  confirmDuplicate: (duplicates: string[]) => Promise<boolean>;
}

type ChangeBody =
  | { kind: 'replace'; id: string }
  | { kind: 'patch'; id: string; fields: Partial<Manga> };
type LocalChange = ChangeBody & { v: number };

/** `updated_at`, or `add_date` for a record that lacks it (contract §2). */
function updatedAt(m: Manga): number {
  return (m.updated_at as number | undefined) ?? m.add_date;
}

function newestFirst(a: Manga, b: Manga): number {
  return updatedAt(b) - updatedAt(a) || b.add_date - a.add_date;
}

export const useLibraryStore = defineStore('library', () => {
  const items = ref<Manga[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const loadError = ref<ApiError | null>(null);
  /** In-library filter text (name, artist or id). */
  const filter = ref('');
  /** DMCA takedowns announced over the socket, for the UI to show. */
  const dmcaAlerts = ref<DmcaAlertEvent[]>([]);

  /** All manga, newest `updated_at` first. */
  const sorted = computed(() => [...items.value].sort(newestFirst));

  /** `sorted` narrowed by `filter`. */
  const visible = computed(() => {
    const q = filter.value.trim().toLowerCase();
    if (!q) return sorted.value;
    return sorted.value.filter((m) =>
      [m.manga_name, m.artist_name, m.manga_id].some((f) =>
        String(f ?? '').toLowerCase().includes(q),
      ),
    );
  });

  function byId(mangaId: string): Manga | undefined {
    return items.value.find((m) => m.manga_id === mangaId);
  }

  // Local changes recorded while a load is in flight, so an older snapshot
  // cannot undo them. `version` orders changes against load start points.
  let version = 0;
  let loadSeq = 0;
  let inFlight = 0;
  const changes: LocalChange[] = [];

  function record(change: ChangeBody): void {
    if (inFlight > 0) changes.push({ ...change, v: ++version });
  }

  function upsert(manga: Manga): void {
    record({ kind: 'replace', id: manga.manga_id });
    const i = items.value.findIndex((m) => m.manga_id === manga.manga_id);
    if (i === -1) items.value.push(manga);
    else items.value[i] = manga;
  }

  function removeLocal(mangaId: string): void {
    record({ kind: 'replace', id: mangaId });
    items.value = items.value.filter((m) => m.manga_id !== mangaId);
  }

  function patch(mangaId: string, fields: Partial<Manga>): void {
    record({ kind: 'patch', id: mangaId, fields });
    const m = byId(mangaId);
    if (m) Object.assign(m, fields);
  }

  /**
   * Merges a snapshot taken at `since` with local changes made after it:
   * a replaced/removed id takes its current local state; a patched id takes
   * the snapshot record with the patched fields on top.
   */
  function merge(snapshot: Manga[], since: number): Manga[] {
    const replaced = new Set<string>();
    const patches = new Map<string, Partial<Manga>>();
    for (const c of changes) {
      if (c.v <= since) continue;
      if (c.kind === 'replace') {
        replaced.add(c.id);
        patches.delete(c.id);
      } else if (!replaced.has(c.id)) {
        patches.set(c.id, { ...patches.get(c.id), ...c.fields });
      }
    }
    const local = new Map(items.value.map((m) => [m.manga_id, m]));
    const out: Manga[] = [];
    const seen = new Set<string>();
    for (const m of snapshot) {
      seen.add(m.manga_id);
      if (replaced.has(m.manga_id)) {
        const cur = local.get(m.manga_id);
        if (cur) out.push(cur);
      } else {
        const p = patches.get(m.manga_id);
        out.push(p ? { ...m, ...p } : m);
      }
    }
    for (const id of replaced) {
      const cur = local.get(id);
      if (!seen.has(id) && cur) out.push(cur);
    }
    return out;
  }

  // ------------------------------------------------------------ actions

  /**
   * `GET /api/library`. Never throws; failures land in `loadError`.
   * Overlapping calls are safe: only the latest-started load is applied,
   * and socket changes made while it was in flight win over its snapshot.
   */
  async function load(): Promise<void> {
    const seq = ++loadSeq;
    const since = version;
    inFlight += 1;
    loading.value = true;
    try {
      const snapshot = await api.getLibrary();
      if (seq !== loadSeq) return;
      items.value = merge(snapshot, since);
      loaded.value = true;
      loadError.value = null;
    } catch (err) {
      if (seq !== loadSeq) return;
      loadError.value = toApiError(err);
    } finally {
      inFlight -= 1;
      if (inFlight === 0) {
        loading.value = false;
        changes.length = 0;
      }
    }
  }

  /**
   * Adds a search candidate. Handles the duplicate → confirm → resubmit
   * flow; see {@link AddOutcome} for the results.
   */
  async function add(
    candidate: Pick<SearchCandidate, 'manga_id' | 'source'>,
    options: AddOptions,
  ): Promise<AddOutcome> {
    const body = { manga_id: candidate.manga_id, source: candidate.source };
    try {
      try {
        return settle(await api.addManga(body));
      } catch (err) {
        if (!isApiError(err) || err.error !== 'duplicate') throw err;
        const names = (err.data as DuplicateData | undefined)?.duplicates ?? [];
        if (!(await options.confirmDuplicate(names))) return { status: 'cancelled' };
        return settle(await api.addManga({ ...body, submit_sign: '1' }));
      }
    } catch (err) {
      if (isApiError(err) && err.error === 'search-expired') return { status: 'search-expired' };
      if (isApiError(err) && err.error === 'already-in-library') {
        const manga = (err.data as AlreadyInLibraryData | undefined)?.manga ?? null;
        if (manga) upsert(manga);
        return { status: 'already-in-library', manga };
      }
      throw err;
    }
  }

  function settle(result: Awaited<ReturnType<typeof api.addManga>>): AddOutcome {
    if (result.status === 'added') upsert(result.manga);
    return result;
  }

  /** Toggles auto-update; resolves to the new `download_switch`. */
  async function toggleAutoUpdate(mangaId: string): Promise<0 | 1> {
    const { currentDownloadStatus } = await api.toggleAutoUpdate(mangaId);
    patch(mangaId, { download_switch: currentDownloadStatus });
    return currentDownloadStatus;
  }

  /** Source chapter list for the re-download picker. */
  function fetchChapters(mangaId: string): Promise<Chapter[]> {
    return api.getLibraryChapters(mangaId);
  }

  /** Queues a re-download of the given chapters. */
  function redownload(mangaId: string, chapters: Chapter[]): Promise<TaskRef> {
    return api.queueRedownload(mangaId, chapters);
  }

  /** Deletes a manga (admin-protected; prompts for the token on 401). */
  async function remove(mangaId: string): Promise<void> {
    await useSessionStore().withAdmin(() => api.deleteManga(mangaId));
    removeLocal(mangaId);
  }

  /** Queues a library-wide re-zip (admin-protected). */
  function rezip(): Promise<TaskRef> {
    return useSessionStore().withAdmin(() => api.rezipLibrary());
  }

  // ------------------------------------------------------------ socket

  function applyChapterCompleted(e: ChapterCompletedEvent): void {
    patch(e.manga_id, {
      last_epi: e.last_epi,
      last_epi_name: e.last_epi_name,
      updated_at: e.updated_at,
    });
  }

  function applyDownloadCompleted(e: DownloadCompletedEvent): void {
    if (e.manga) upsert(e.manga);
    else removeLocal(e.manga_id);
  }

  function applyDmcaAlert(e: DmcaAlertEvent): void {
    removeLocal(e.manga_id);
    dmcaAlerts.value.push(e);
  }

  function dismissDmcaAlert(mangaId: string): void {
    dmcaAlerts.value = dmcaAlerts.value.filter((a) => a.manga_id !== mangaId);
  }

  return {
    items,
    loaded,
    loading,
    loadError,
    filter,
    dmcaAlerts,
    sorted,
    visible,
    byId,
    load,
    add,
    toggleAutoUpdate,
    fetchChapters,
    redownload,
    remove,
    rezip,
    applyChapterCompleted,
    applyDownloadCompleted,
    applyDmcaAlert,
    dismissDmcaAlert,
  };
});
