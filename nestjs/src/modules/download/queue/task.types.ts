/** Task kinds — match the legacy `dtype` value semantics in
 *  utils/TaskQueue.py:worker.
 *   - FULL_MANGA: download all new/missing chapters of a manga
 *   - REDOWNLOAD: re-download a user-selected chapter list
 *   - REZIP: walk the download root and re-package any unzipped chapters */
export enum TaskKind {
  FULL_MANGA = 'full-manga',
  REDOWNLOAD = 'redownload',
  REZIP = 'rezip',
}

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface FullMangaPayload {
  kind: TaskKind.FULL_MANGA;
  mangaId: string;
}

export interface RedownloadPayload {
  kind: TaskKind.REDOWNLOAD;
  mangaId: string;
  /** Subset of chapters to re-fetch — the same shape as
   *  IMangaSource.getChapters returns. */
  chapters: { index: number; title: string; url: string }[];
}

export interface RezipPayload {
  kind: TaskKind.REZIP;
}

export type TaskPayload = FullMangaPayload | RedownloadPayload | RezipPayload;

export interface TaskHandle {
  id: string;
  payload: TaskPayload;
  status: TaskStatus;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

/** Public-facing snapshot of a task — what controllers expose. */
export interface TaskSummaryDto {
  id: string;
  kind: TaskKind;
  mangaId?: string;
  status: TaskStatus;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
}
