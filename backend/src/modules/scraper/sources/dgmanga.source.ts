import { Injectable } from '@nestjs/common';
import {
  ChapterImagesDto,
  ChapterListResultDto,
  MangaMetadataDto,
  SearchResultDto,
} from '../dto';
import { IMangaSource } from '../interfaces/manga-source.interface';
import { PythonRunnerService } from '../python/python-runner.service';

interface DgmangaMetadataPayload {
  chapterCount: number;
  serialization: 0 | 1;
  errorCode?: 501;
}

interface DgmangaChaptersPayload {
  chapters: { index: number; title: string; url: string }[];
  errorCode?: 501;
}

interface DgmangaChapterImagesPayload {
  chapterTitle: string;
  imageUrls: string[];
  imagePages: string[];
  requestHeaders: Record<string, string>;
  errorCode?: 429 | 501 | 503;
}

/** DGmanga source — implements IMangaSource by shelling out to
 *  scrape_cli.py with --source=dgmanga. */
@Injectable()
export class DGmangaSource implements IMangaSource {
  readonly name = 'dgmanga';
  readonly displayName = 'DogeManga';

  constructor(private readonly runner: PythonRunnerService) {}

  async search(query: string): Promise<SearchResultDto[]> {
    const data = await this.runner.run<SearchResultDto[]>({
      source: this.name,
      command: 'search',
      args: [query],
    });
    return data.map((item) => ({ ...item, source: this.name }));
  }

  async getMetadata(mangaId: string): Promise<MangaMetadataDto> {
    const data = await this.runner.run<DgmangaMetadataPayload>({
      source: this.name,
      command: 'metadata',
      args: [mangaId],
    });
    return {
      chapterCount: data.chapterCount,
      serialization: data.serialization,
      errorCode: data.errorCode,
    };
  }

  async getChapters(mangaId: string): Promise<ChapterListResultDto> {
    const data = await this.runner.run<DgmangaChaptersPayload>({
      source: this.name,
      command: 'chapters',
      args: [mangaId],
    });
    return {
      chapters: data.chapters,
      errorCode: data.errorCode,
    };
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImagesDto> {
    const data = await this.runner.run<DgmangaChapterImagesPayload>({
      source: this.name,
      command: 'chapter-images',
      args: [chapterUrl],
    });
    return {
      chapterTitle: data.chapterTitle,
      imageUrls: data.imageUrls,
      requestHeaders: data.requestHeaders,
      errorCode: data.errorCode,
    };
  }
}
