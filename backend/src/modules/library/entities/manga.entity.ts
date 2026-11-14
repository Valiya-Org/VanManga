/** Persisted manga record. Field names mirror the legacy
 *  manga_library.json schema exactly so the existing file (and the
 *  Vue frontend that consumes it) keep working unchanged.
 *  See main.py:LIB_PATH and utils/make_manga_object.py for the source. */
export interface Manga {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  /** Cover URL. Since P2 new records store the relative
   *  `/api/library/<id>/thumbnail`; older ones hold absolute
   *  `MANGA_BASE_URL/...` URLs. Canonical routes normalise on read
   *  (see manga-view.ts). */
  thumbnail: string;

  /** Last successfully downloaded chapter index (1-based). */
  last_epi: number;
  /** Title of the last successfully downloaded chapter. */
  last_epi_name: string;
  /** Whether the initial full-manga download has completed. */
  completed: boolean;
  /** 0 = ongoing (連載中), 1 = completed at the source. */
  serialization: 0 | 1;
  /** 0 = auto-update enabled, 1 = paused (user-controlled). */
  download_switch: 0 | 1;
  /** Unix epoch seconds (UTC) when the manga was added. Never modified. */
  add_date: number;

  /** Unix epoch seconds of the last update: written when the newest
   *  downloaded chapter advances or a download completes. Absent in
   *  pre-P2 records — read it through toApiManga (defaults to add_date). */
  updated_at?: number;

  /** Source identifier the manga was added from. New in NestJS rewrite —
   *  defaults to 'dgmanga' for legacy library entries on first migration. */
  source?: string;

  /** Kavita series URL, set asynchronously by KavitaService. Defaults to
   *  'None' (string sentinel mirrors 2.1-dev behaviour). */
  kavita_url?: string;

  /** Optional, captured by some sources during search (e.g. dgmanga 2.1-dev). */
  recent_update_date?: string;
}

/** Shape of the JSON file on disk: keyed by manga_id. */
export type MangaLibrary = Record<string, Manga>;
