/** WebSocket payload shapes — docs/api-contract.md §4.
 *
 *  Two generations are emitted side by side until P4:
 *   - canonical events (download_started, download_progress,
 *     chapter_completed, download_completed, queue_updated, scan_completed,
 *     dmca_alert) for the new frontend;
 *   - legacy events (downloading_info, response, complete_info) with the
 *     snake_case keys the current frontend reads. */

import type { ApiManga } from '../library/manga-view';

// ------------------------------------------------------------- canonical

export type DownloadTaskKind = 'full-manga' | 'redownload';

export interface DownloadStartedPayload {
  manga_id: string;
  kind: DownloadTaskKind;
}

export interface DownloadProgressPayload {
  manga_id: string;
  chapters_total: number;
  /** Chapters finished so far, failures included. */
  chapters_done: number;
  chapters_failed: number;
}

export interface ChapterCompletedPayload {
  manga_id: string;
  chapter_index: number;
  /** Reformatted title (same as the archive name). */
  chapter_title: string;
  last_epi: number;
  last_epi_name: string;
  updated_at: number;
}

export interface DownloadCompletedPayload {
  manga_id: string;
  kind: DownloadTaskKind;
  status: 'done' | 'failed';
  chapters_total: number;
  chapters_failed: number;
  /** Record after the run; null if the manga was removed (DMCA). */
  manga: ApiManga | null;
}

/** 'dmca_alert' — the source reported a DMCA takedown (errorCode 504);
 *  the manga has been removed from the library. */
export interface DmcaAlertPayload {
  manga_id: string;
  manga_name: string;
}

// ---------------------------------------------------------------- legacy

/** 'response' — emitted when a manga's newest downloaded episode advances.
 *  (Flask emitted `newest_epi*` keys the frontend never read; these are the
 *  keys old MangaKu.vue `sockets.response` consumes.) */
export interface ResponsePayload {
  manga_id: string;
  last_epi_name: string;
  last_epi: number;
}

/** 'complete_info' — a manga finished its current download run.
 *  The frontend only reads `manga_id`. */
export interface CompleteInfoPayload {
  manga_id: string;
}

/** Event name constants. `downloading_info` carries a BARE manga_id
 *  string, matching the old handler `downloading_info(data){ let id = data }`. */
export const SOCKET_EVENTS = {
  DOWNLOAD_STARTED: 'download_started',
  DOWNLOAD_PROGRESS: 'download_progress',
  CHAPTER_COMPLETED: 'chapter_completed',
  DOWNLOAD_COMPLETED: 'download_completed',
  QUEUE_UPDATED: 'queue_updated',
  SCAN_COMPLETED: 'scan_completed',
  DMCA_ALERT: 'dmca_alert',
  // legacy, removed in P4
  DOWNLOADING: 'downloading_info',
  RESPONSE: 'response',
  COMPLETE: 'complete_info',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
