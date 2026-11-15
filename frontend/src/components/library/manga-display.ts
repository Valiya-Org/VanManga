import type { Manga } from '@/api/types';

/** "新" badge window. */
export const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** `updated_at`, or `add_date` for an old record without it (contract §2). */
export function mangaUpdatedAt(m: Manga): number {
  return (m.updated_at as number | undefined) ?? m.add_date;
}

/** Updated within the last three days. */
export function isRecentlyUpdated(m: Manga, now: number = Date.now()): boolean {
  return now - mangaUpdatedAt(m) * 1000 <= NEW_WINDOW_MS;
}
