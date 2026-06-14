import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SearchCacheService } from '../search-cache/search-cache.service';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly scraper: ScraperService,
    private readonly searchCache: SearchCacheService,
  ) {}

  @Get('sources')
  listSources() {
    return { data: this.scraper.listSources(), code: 200 };
  }

  /** Search. By default each result carries the base64 cover in `thumbnail`
   *  (legacy contract). Pass `?thumb=url` to get a lean payload where
   *  `thumbnail` is instead a URL to the cached-thumbnail endpoint below —
   *  the recommended path for new clients (no base64 in the JSON). */
  @Get(':source/search')
  async search(
    @Param('source') source: string,
    @Query('q') q: string,
    @Query('thumb') thumb?: string,
  ) {
    const results = await this.scraper.search(source, q);
    if (thumb === 'url') {
      return results.map((r) => ({
        ...r,
        thumbnail: `/api/scraper/${source}/search-thumbnail/${r.manga_id}`,
      }));
    }
    return results;
  }

  /** Serves a cached search candidate's cover image as binary JPEG, so
   *  `?thumb=url` clients can render `<img src=...>` without base64. */
  @Get(':source/search-thumbnail/:mangaId')
  searchThumbnail(
    @Param('source') source: string,
    @Param('mangaId') mangaId: string,
    @Res() res: Response,
  ): void {
    const cached = this.searchCache.get(source, mangaId);
    if (!cached) {
      res.status(HttpStatus.NOT_FOUND).json({ data: false, code: 404 });
      return;
    }
    res.type('image/jpeg').send(Buffer.from(cached.thumbnail, 'base64'));
  }

  @Get(':source/manga/:mangaId/metadata')
  metadata(
    @Param('source') source: string,
    @Param('mangaId') mangaId: string,
  ) {
    return this.scraper.getMetadata(source, mangaId);
  }

  @Get(':source/manga/:mangaId/chapters')
  chapters(
    @Param('source') source: string,
    @Param('mangaId') mangaId: string,
  ) {
    return this.scraper.getChapters(source, mangaId);
  }

  @Get(':source/chapter-images')
  chapterImages(
    @Param('source') source: string,
    @Query('url') url: string,
  ) {
    return this.scraper.getChapterImages(source, url);
  }
}
