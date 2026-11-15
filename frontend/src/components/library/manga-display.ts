import type { Manga } from '@/api/types';
import { mangaUpdatedAt } from '@/api/manga';

/** "新" badge window. */
export const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Updated within the last three days. */
export function isRecentlyUpdated(m: Manga, now: number = Date.now()): boolean {
  return now - mangaUpdatedAt(m) * 1000 <= NEW_WINDOW_MS;
}
