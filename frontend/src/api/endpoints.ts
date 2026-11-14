/**
 * One typed function per canonical endpoint used by the frontend
 * (docs/api-contract.md §3). Every function resolves to the envelope's
 * `data` and rejects with `ApiError`.
 *
 * Not wrapped on purpose (the contract says the new frontend does not need
 * them): the scraper debug routes (§3.2) and `library/short|search|paginate`
 * (§3.3, may be removed in P4), and `POST /api/kavita/refreshtoken` (§3.5):
 * the frontend only uses Kavita's `loginUrl`, never the JWT, so there is
 * nothing to refresh.
 */
import { request } from './http';
import type {
  AddMangaBody,
  AddMangaResult,
  Chapter,
  KavitaLoginResult,
  Manga,
  QueueSnapshot,
  RuntimeConfig,
  ScraperSource,
  SearchCandidate,
  TaskRef,
  TaskSummary,
  ToggleAutoUpdateResult,
} from './types';

const id = (mangaId: string) => encodeURIComponent(mangaId);

// ------------------------------------------------------------- §3.1 config

/** `GET /api/config` */
export function getConfig(): Promise<RuntimeConfig> {
  return request({ method: 'GET', url: 'config' });
}

// ------------------------------------------------------------- §3.2 scraper

/** `GET /api/scraper/sources` */
export function getSources(): Promise<ScraperSource[]> {
  return request({ method: 'GET', url: 'scraper/sources' });
}

/** `GET /api/scraper/:source/search?q=` — `[]` when nothing matches. */
export function searchManga(source: string, q: string): Promise<SearchCandidate[]> {
  return request({
    method: 'GET',
    url: `scraper/${encodeURIComponent(source)}/search`,
    params: { q },
  });
}

/** URL of a search candidate's cover (valid while the search is cached). */
export function searchThumbnailUrl(source: string, mangaId: string): string {
  return `/api/scraper/${encodeURIComponent(source)}/search-thumbnail/${id(mangaId)}`;
}

// ------------------------------------------------------------- §3.3 library

/** `GET /api/library` — insertion order; sort on the client. */
export function getLibrary(): Promise<Manga[]> {
  return request({ method: 'GET', url: 'library' });
}

/**
 * `POST /api/library` (lean body). Failures to branch on:
 * 409 `already-in-library` (data `{ manga }`), 409 `duplicate`
 * (data `{ duplicates }`), 410 `search-expired`.
 */
export function addManga(body: AddMangaBody): Promise<AddMangaResult> {
  const payload: AddMangaBody = { manga_id: body.manga_id, source: body.source };
  if (body.submit_sign) payload.submit_sign = body.submit_sign;
  return request({ method: 'POST', url: 'library', data: payload });
}

/** URL of a library manga's cover. */
export function libraryThumbnailUrl(mangaId: string): string {
  return `/api/library/${id(mangaId)}/thumbnail`;
}

/** `GET /api/library/:mangaId/chapters` — live chapter list from the source. */
export function getLibraryChapters(mangaId: string): Promise<Chapter[]> {
  return request({ method: 'GET', url: `library/${id(mangaId)}/chapters` });
}

/** `POST /api/library/:mangaId/auto-update` — toggles `download_switch`. */
export function toggleAutoUpdate(mangaId: string): Promise<ToggleAutoUpdateResult> {
  return request({ method: 'POST', url: `library/${id(mangaId)}/auto-update` });
}

/** `DELETE /api/library/:mangaId` 🔒 */
export function deleteManga(mangaId: string): Promise<true> {
  return request({ method: 'DELETE', url: `library/${id(mangaId)}` });
}

/** `POST /api/library/rezip` 🔒 */
export function rezipLibrary(): Promise<TaskRef> {
  return request({ method: 'POST', url: 'library/rezip' });
}

// ------------------------------------------------------------- §3.4 download

/** `POST /api/download` — queue a full download. */
export function queueDownload(mangaId: string): Promise<TaskRef> {
  return request({ method: 'POST', url: 'download', data: { manga_id: mangaId } });
}

/** `POST /api/download/chapters` — re-download the given chapters. */
export function queueRedownload(mangaId: string, chapters: Chapter[]): Promise<TaskRef> {
  return request({
    method: 'POST',
    url: 'download/chapters',
    data: { manga_id: mangaId, chapters },
  });
}

/** `GET /api/download/queue` */
export function getQueue(): Promise<QueueSnapshot> {
  return request({ method: 'GET', url: 'download/queue' });
}

/** `GET /api/download/current` */
export function getCurrentTask(): Promise<TaskSummary | null> {
  return request({ method: 'GET', url: 'download/current' });
}

// ------------------------------------------------------------- §3.5 kavita

/** `POST /api/kavita/login` */
export function kavitaLogin(username: string, password: string): Promise<KavitaLoginResult> {
  return request({ method: 'POST', url: 'kavita/login', data: { username, password } });
}
