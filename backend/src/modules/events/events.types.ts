/** WebSocket payload shapes. These match the field names the Vue frontend
 *  actually reads in its socket handlers (snake_case), which is the real
 *  contract — note the legacy Flask backend emitted `response` with
 *  `newest_epi*` keys the frontend never read, a latent bug fixed here by
 *  emitting the keys the frontend consumes. */

/** 'response' — emitted when a manga's newest downloaded episode advances.
 *  Frontend updates the library row's `last_epi` / `last_epi_name`
 *  (see old MangaKu.vue `sockets.response`). */
export interface ResponsePayload {
  manga_id: string;
  last_epi_name: string;
  last_epi: number;
}

/** 'complete_info' — a manga finished all of its current downloads.
 *  Frontend only reads `manga_id` (see old MangaKu.vue `sockets.complete_info`). */
export interface CompleteInfoPayload {
  manga_id: string;
}

/** 'dmca_alert' — a manga turned out to be DMCA-restricted at the source
 *  (errorCode 504). Not part of the legacy contract; kept for the 2.1-dev UI. */
export interface DmcaAlertPayload {
  manga_id: string;
  manga_name: string;
}

/** Event name constants — keep aligned with the Vue frontend listeners.
 *  `downloading_info` carries a BARE manga_id string (not an object), matching
 *  the old frontend handler `downloading_info(data){ let id = data; ... }`. */
export const SOCKET_EVENTS = {
  DOWNLOADING: 'downloading_info',
  RESPONSE: 'response',
  COMPLETE: 'complete_info',
  SCAN_COMPLETED: 'scan_completed',
  DMCA_ALERT: 'dmca_alert',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
