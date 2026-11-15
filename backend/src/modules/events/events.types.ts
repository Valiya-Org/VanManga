/** WebSocket payload shapes — docs/api-contract.md §4. */

import type { ApiManga } from '../library/manga-view';

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

/** Event name constants — the only events the server emits. */
export const SOCKET_EVENTS = {
  DOWNLOAD_STARTED: 'download_started',
  DOWNLOAD_PROGRESS: 'download_progress',
  CHAPTER_COMPLETED: 'chapter_completed',
  DOWNLOAD_COMPLETED: 'download_completed',
  QUEUE_UPDATED: 'queue_updated',
  SCAN_COMPLETED: 'scan_completed',
  DMCA_ALERT: 'dmca_alert',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
