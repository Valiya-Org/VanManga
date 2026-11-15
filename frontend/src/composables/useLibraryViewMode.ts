import { ref, watch, type Ref } from 'vue';

export type LibraryViewMode = 'cards' | 'list';

export const LIBRARY_VIEW_STORAGE_KEY = 'vanmanga.libraryView';

function read(): LibraryViewMode {
  try {
    return localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

/**
 * Library "卡片 | 列表" choice, remembered in localStorage (best effort:
 * storage may be unavailable, e.g. blocked site data).
 */
export function useLibraryViewMode(): Ref<LibraryViewMode> {
  const mode = ref<LibraryViewMode>(read());
  watch(mode, (value) => {
    try {
      localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, value);
    } catch {
      // Not persisted; the choice still applies for this page.
    }
  });
  return mode;
}
