/**
 * Types mirroring docs/api-contract.md (P2). Keep in lockstep with the
 * contract; field names are the wire names.
 */

// ------------------------------------------------------------- §1 envelope

/** Every machine-readable `error` string listed in the contract (§1.3). */
export const API_ERROR_CODES = [
  // 400
  'validation-failed',
  'query-required',
  'bad-request',
  // 401 (admin token only)
  'admin-token-required',
  'admin-token-invalid',
  // 403
  'kavita-login-failed',
  'kavita-refresh-failed',
  // 404
  'not-found',
  'manga-not-found',
  'unknown-source',
  'thumbnail-not-found',
  'kavita-disabled',
  // 409
  'manga-busy',
  'already-in-library',
  'duplicate',
  // 410
  'search-expired',
  // 429
  'rate-limited',
  // 451
  'dmca',
  // 500
  'delete-failed',
  'internal-error',
  // 502
  'scraper-failed',
  'scraper-blocked',
  'kavita-unreachable',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Status-default codes the backend filter emits when an exception has no
 * dedicated code (§1.3), plus `http-<status>` for anything else.
 */
export const DEFAULT_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'conflict',
  'payload-too-large',
] as const;

/** Client-side codes, never sent by the server. */
export const CLIENT_ERROR_CODES = [
  /** No response at all (offline, backend down, CORS, timeout). */
  'network-error',
  /** A response arrived but was not a contract envelope (e.g. proxy HTML). */
  'invalid-response',
] as const;

/** Any `error` string an {@link ApiError} may carry. Unknown server strings
 *  are kept verbatim, hence the `string` escape hatch. */
export type AnyErrorCode =
  | ApiErrorCode
  | (typeof DEFAULT_ERROR_CODES)[number]
  | (typeof CLIENT_ERROR_CODES)[number]
  | (string & {});

export interface ApiSuccess<T> {
  code: 200;
  data: T;
}

export interface ApiFailure {
  code: number;
  error: string;
  message?: string;
  data?: unknown;
}

// ------------------------------------------------------------- §2 data types

/**
 * A library record. Old records may carry extra, undocumented fields; they
 * are passed through untouched and must not be relied on.
 */
export interface Manga {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  /** Always `/api/library/<encodeURIComponent(manga_id)>/thumbnail`. */
  thumbnail: string;
  last_epi: number;
  last_epi_name: string;
  completed: boolean;
  /** 0 = ongoing, 1 = finished at the source. */
  serialization: 0 | 1;
  /** 0 = auto-update on, 1 = paused. */
  download_switch: 0 | 1;
  /** unix seconds */
  add_date: number;
  /** unix seconds; the library is sorted by this, newest first. */
  updated_at: number;
  source: string;
  kavita_url: string | null;
  recent_update_date?: string;
}

export interface SearchCandidate {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  /** `/api/scraper/<source>/search-thumbnail/<manga_id>`, valid while cached. */
  thumbnail: string;
  source: string;
  recent_update_date?: string;
}

export interface Chapter {
  /** 1-based, source order. */
  index: number;
  title: string;
  url: string;
}

export type TaskKind = 'full-manga' | 'redownload' | 'rezip';

/** Queue payloads use camelCase (`mangaId`, `taskId`) by design, unlike
 *  the snake_case `manga_id` elsewhere. */
export interface TaskSummary {
  id: string;
  kind: TaskKind;
  /** Absent for rezip tasks. */
  mangaId?: string;
  status: 'pending' | 'running';
  /** unix ms */
  enqueuedAt: number;
  /** unix ms, present while running */
  startedAt?: number;
}

export interface QueueSnapshot {
  active: TaskSummary | null;
  pending: TaskSummary[];
}

// ------------------------------------------------------------- §3 endpoints

export interface RuntimeConfig {
  kavitaEnabled: boolean;
  kavitaExposeUrl: string | null;
  adminRequired: boolean;
}

export interface ScraperSource {
  name: string;
  displayName: string;
}

/** '0'/omitted: first submit; '1': confirmed duplicate; '2': cancel. */
export type SubmitSign = '0' | '1' | '2';

export interface AddMangaBody {
  manga_id: string;
  source: string;
  submit_sign?: SubmitSign;
}

export type AddMangaResult =
  | { status: 'added'; manga: Manga }
  | { status: 'cancelled' };

/** `data` of a 409 `already-in-library`. */
export interface AlreadyInLibraryData {
  manga: Manga;
}

/** `data` of a 409 `duplicate`. */
export interface DuplicateData {
  duplicates: string[];
}

export interface ToggleAutoUpdateResult {
  currentDownloadStatus: 0 | 1;
}

export interface TaskRef {
  taskId: string;
}

export interface KavitaLoginResult {
  apiKey: string;
  jwt: string;
  refreshToken: string;
  /** Full Kavita URL that logs the browser in; use as-is. */
  loginUrl: string;
}

// ------------------------------------------------------------- §4 socket

export interface DownloadStartedEvent {
  manga_id: string;
  kind: 'full-manga' | 'redownload';
}

export interface DownloadProgressEvent {
  manga_id: string;
  chapters_total: number;
  chapters_done: number;
  chapters_failed: number;
}

export interface ChapterCompletedEvent {
  manga_id: string;
  chapter_index: number;
  chapter_title: string;
  last_epi: number;
  last_epi_name: string;
  /** unix seconds */
  updated_at: number;
}

export interface DownloadCompletedEvent {
  manga_id: string;
  kind: 'full-manga' | 'redownload';
  status: 'done' | 'failed';
  chapters_total: number;
  chapters_failed: number;
  /** Final record; null when the manga was removed (e.g. DMCA). */
  manga: Manga | null;
}

export interface DmcaAlertEvent {
  manga_id: string;
  manga_name: string;
}

export interface ServerToClientEvents {
  download_started: (p: DownloadStartedEvent) => void;
  download_progress: (p: DownloadProgressEvent) => void;
  chapter_completed: (p: ChapterCompletedEvent) => void;
  download_completed: (p: DownloadCompletedEvent) => void;
  queue_updated: (p: QueueSnapshot) => void;
  scan_completed: () => void;
  dmca_alert: (p: DmcaAlertEvent) => void;
}
