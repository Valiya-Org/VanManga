/**
 * Application-wide event constants.
 *
 * Using events instead of direct cross-module calls eliminates
 * circular dependencies between DownloadModule, KavitaModule,
 * and LibraryModule.
 */

/** Fired when a manga finishes downloading (full or redownload).
 *  Listener: KavitaService (triggers folder scan). */
export const DOWNLOAD_COMPLETED = 'download.completed';

export interface DownloadCompletedEvent {
  mangaId: string;
  mangaName: string;
}

/** Fired when a manga is added to the library and needs downloading.
 *  Listener: DownloadService (enqueues full-manga task). */
export const MANGA_ADDED = 'manga.added';

export interface MangaAddedEvent {
  mangaId: string;
}
