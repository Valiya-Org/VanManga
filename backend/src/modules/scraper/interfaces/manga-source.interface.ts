import {
  ChapterImagesDto,
  ChapterListResultDto,
  MangaMetadataDto,
  SearchResultDto,
} from '../dto';

/** Minimal contract every manga source must satisfy.
 *
 *  Adding a new source = create a class implementing this interface and
 *  register it with `SourceRegistryService`. The rest of the system
 *  (download pipeline, library, scheduler, queue, websocket, kavita)
 *  is source-agnostic and needs no changes. */
export interface IMangaSource {
  /** Stable identifier, used in API routes and source registry lookups.
   *  E.g. 'dgmanga'. */
  readonly name: string;

  /** Human-readable display name (English / locale-friendly). */
  readonly displayName: string;

  /** Fuzzy search by manga title. Returns at most ~10 candidates. */
  search(query: string): Promise<SearchResultDto[]>;

  /** Probe the source for current chapter count + serialisation status.
   *  Used by daily scheduled job to detect new chapters. */
  getMetadata(mangaId: string): Promise<MangaMetadataDto>;

  /** Resolve the full chapter list for a manga, ordered ascending. */
  getChapters(mangaId: string): Promise<ChapterListResultDto>;

  /** Resolve image URLs (and any per-request headers) for one chapter.
   *  NestJS handles the actual download so progress + retries can flow
   *  through Bull jobs and the WebSocket gateway. */
  getChapterImages(chapterUrl: string): Promise<ChapterImagesDto>;
}

export const MANGA_SOURCE_TOKEN = Symbol('MANGA_SOURCE');
