import type { Manga } from './types';

/**
 * Small readings of a `Manga` record that follow the contract (§2), shared by
 * the library store and the library components.
 */

/** `updated_at`, or `add_date` for an old record that lacks it. */
export function mangaUpdatedAt(m: Manga): number {
  return m.updated_at ?? m.add_date;
}

/** Auto-update is on: `download_switch === 0` (0 means on). */
export function isAutoUpdate(m: Manga): boolean {
  return m.download_switch === 0;
}
