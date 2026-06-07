/** Mirrors the WebSocket payload shape used by the legacy Flask backend. */

/** Sent from main.py:265 / main.py:395 — emitted right before a download starts. */
export interface DownloadingInfoPayload {
  mangaId: string;
}

/** Sent from main.py:337 / main.py:447 — fine-grained chapter progress. */
export interface ChapterProgressPayload {
  mangaId: string;
  mangaName: string;
  chapterTitle: string;
  current: number;
  total: number;
  status: 'downloading' | 'finished' | 'failed';
  message?: string;
}

/** Sent from main.py:346 / main.py:454 — overall download completion. */
export interface CompleteInfoPayload {
  mangaId: string;
  mangaName: string;
  success: boolean;
  failedChapters?: string[];
  message?: string;
}

/** Sent when a manga turns out to be DMCA-restricted at the source.
 *  Originates from the 2.1-dev evolution branch (errorCode 504). */
export interface DmcaAlertPayload {
  mangaId: string;
  mangaName: string;
}

/** Event name constants — keep aligned with the Vue frontend listeners. */
export const SOCKET_EVENTS = {
  DOWNLOADING: 'downloading_info',
  PROGRESS: 'response',
  COMPLETE: 'complete_info',
  SCAN_COMPLETED: 'scan_completed',
  DMCA_ALERT: 'dmca_alert',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
