import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import { searchManga } from '@/api/endpoints';
import { isCanceled, type ApiError } from '@/api/errors';
import { toApiError } from '@/api/http';
import type { SearchCandidate } from '@/api/types';

export interface MangaSearch {
  /** Input text (bind with `v-model`). */
  query: Ref<string>;
  /** Candidates of the latest completed search. */
  results: Ref<SearchCandidate[]>;
  /** A search is in flight. */
  loading: Ref<boolean>;
  /** Failure of the latest search (`errorMessage(error)` for UI text). */
  error: Ref<ApiError | null>;
  /** Last submitted (trimmed) query, for "search again" after `search-expired`. */
  lastQuery: Ref<string | null>;
  /** Searches `q` (default: `query`). Never throws. Aborts the previous search. */
  search(q?: string): Promise<void>;
  /** Repeats the last submitted query; no-op if there was none. */
  research(): Promise<void>;
  /** Aborts the search in flight, silently. */
  cancel(): void;
}

/**
 * State for the add-manga overlay's search. Not a store: each caller gets
 * its own state. Only the latest search can write results; an older one is
 * aborted and its late response ignored. If called inside a component or
 * effect scope, the request in flight is aborted when the scope ends.
 */
export function useMangaSearch(source = 'dgmanga'): MangaSearch {
  const query = ref('');
  const results = ref<SearchCandidate[]>([]);
  const loading = ref(false);
  const error = ref<ApiError | null>(null);
  const lastQuery = ref<string | null>(null);
  let controller: AbortController | null = null;

  function cancel(): void {
    controller?.abort();
    controller = null;
    loading.value = false;
  }

  async function search(q: string = query.value): Promise<void> {
    cancel();
    const trimmed = q.trim();
    if (!trimmed) {
      results.value = [];
      error.value = null;
      return;
    }
    const mine = new AbortController();
    controller = mine;
    lastQuery.value = trimmed;
    loading.value = true;
    error.value = null;
    try {
      const found = await searchManga(source, trimmed, { signal: mine.signal });
      if (controller !== mine) return;
      results.value = found;
    } catch (err) {
      if (controller !== mine || isCanceled(err)) return;
      error.value = toApiError(err);
      results.value = [];
    } finally {
      if (controller === mine) {
        controller = null;
        loading.value = false;
      }
    }
  }

  function research(): Promise<void> {
    return lastQuery.value ? search(lastQuery.value) : Promise.resolve();
  }

  if (getCurrentScope()) onScopeDispose(cancel);

  return { query, results, loading, error, lastQuery, search, research, cancel };
}
