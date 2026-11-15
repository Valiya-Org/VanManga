import { Injectable, Logger } from '@nestjs/common';
import { SearchCacheService } from '../search-cache/search-cache.service';
import {
  ChapterImagesDto,
  ChapterListResultDto,
  MangaMetadataDto,
  SearchResultDto,
} from './dto';
import { SourceRegistryService } from './sources/source-registry.service';

/** A manga id usable as part of a file name: non-empty, no path separator
 *  or control character, and not `.` / `..`. (DogeManga ids look like
 *  `E8uHNgs8` or `-LoL2tSY`.) */
export function isSafeMangaId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    // eslint-disable-next-line no-control-regex
    /^[^/\\\x00-\x1f]+$/.test(id) &&
    id !== '.' &&
    id !== '..'
  );
}

/** Single entry point for any module that needs to scrape.
 *  Routes calls to the appropriate IMangaSource by name. The download
 *  pipeline, scheduler and library never import a concrete source — they
 *  always go through this service. */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly registry: SourceRegistryService,
    private readonly searchCache: SearchCacheService,
  ) {}

  listSources(): { name: string; displayName: string }[] {
    return this.registry.describe();
  }

  async search(sourceName: string, query: string): Promise<SearchResultDto[]> {
    const raw = await this.registry.get(sourceName).search(query);
    // A candidate's id later names the download folder (<name>$<id>, removed
    // with rm -rf on delete) and the cover file (<id>.jpg): drop any whose id
    // could act as a path, so a broken or hostile source cannot escape the
    // data directories. Existing library records are not affected.
    const results = raw.filter((r) => {
      if (isSafeMangaId(r.manga_id)) return true;
      this.logger.warn(
        `${sourceName}: dropping search result with unsafe manga_id ${JSON.stringify(r.manga_id)}`,
      );
      return false;
    });
    // Cache candidates so a later add can resolve the full record (incl. the
    // base64 thumbnail) from just {source, manga_id} — no round-tripping the
    // image back through the client.
    this.searchCache.putMany(results);
    return results;
  }

  getMetadata(sourceName: string, mangaId: string): Promise<MangaMetadataDto> {
    return this.registry.get(sourceName).getMetadata(mangaId);
  }

  getChapters(
    sourceName: string,
    mangaId: string,
  ): Promise<ChapterListResultDto> {
    return this.registry.get(sourceName).getChapters(mangaId);
  }

  getChapterImages(
    sourceName: string,
    chapterUrl: string,
  ): Promise<ChapterImagesDto> {
    return this.registry.get(sourceName).getChapterImages(chapterUrl);
  }
}
