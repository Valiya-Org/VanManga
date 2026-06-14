import { Injectable, Logger } from '@nestjs/common';
import { SearchCacheService } from '../search-cache/search-cache.service';
import {
  ChapterImagesDto,
  ChapterListResultDto,
  MangaMetadataDto,
  SearchResultDto,
} from './dto';
import { SourceRegistryService } from './sources/source-registry.service';

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
    const results = await this.registry.get(sourceName).search(query);
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
