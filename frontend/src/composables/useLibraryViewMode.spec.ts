import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { LIBRARY_VIEW_STORAGE_KEY, useLibraryViewMode } from './useLibraryViewMode';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useLibraryViewMode', () => {
  it('defaults to cards', () => {
    expect(useLibraryViewMode().value).toBe('cards');
  });

  it('restores and persists the choice', async () => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, 'list');
    const mode = useLibraryViewMode();
    expect(mode.value).toBe('list');
    mode.value = 'cards';
    await nextTick();
    expect(localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)).toBe('cards');
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, 'grid');
    expect(useLibraryViewMode().value).toBe('cards');
  });

  it('works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const mode = useLibraryViewMode();
    expect(mode.value).toBe('cards');
    mode.value = 'list';
    await nextTick();
    expect(mode.value).toBe('list');
  });
});
