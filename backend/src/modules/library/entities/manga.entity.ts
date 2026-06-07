/** Persisted manga record. Field names mirror the legacy
 *  manga_library.json schema exactly so the existing file (and the
 *  Vue frontend that consumes it) keep working unchanged.
 *  See main.py:LIB_PATH and utils/make_manga_object.py for the source. */
export interface Manga {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  /** Either base64-encoded JPG (legacy format from search results) or
   *  a `MANGA_BASE_URL/api/.../thumbnail?mid=...` URL after persisting. */
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
  /** Unix epoch seconds (UTC) when the manga was added. */
  add_date: number;

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
