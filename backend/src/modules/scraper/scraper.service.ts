import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly registry: SourceRegistryService) {}

  listSources(): { name: string; displayName: string }[] {
    return this.registry.describe();
  }

  search(sourceName: string, query: string): Promise<SearchResultDto[]> {
    return this.registry.get(sourceName).search(query);
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
