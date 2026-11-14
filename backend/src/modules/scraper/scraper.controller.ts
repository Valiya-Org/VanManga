import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiException } from '../../common/http/api-exception';
import { ok } from '../../common/http/envelope';
import { SearchCacheService } from '../search-cache/search-cache.service';
import type { SearchResultDto } from './dto';
import { PythonRunnerError } from './python/python-runner.types';
import { assertScrapeOk, callScraper, toScraperFailure } from './scrape-errors';
import { ScraperService } from './scraper.service';

/** scrape_cli.py reports "nothing found" as source status 457. */
const NO_RESULTS = 457;

/** Canonical scraper routes — docs/api-contract.md §3.2. */
@ApiTags('scraper')
@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly scraper: ScraperService,
    private readonly searchCache: SearchCacheService,
  ) {}

  @Get('sources')
  @ApiOperation({ summary: 'Registered manga sources' })
  listSources() {
    return ok(this.scraper.listSources());
  }

  /** Each result's `thumbnail` is a URL to the cached-cover endpoint below;
   *  the base64 cover only travels on the legacy route. */
  @Get(':source/search')
  @ApiOperation({ summary: 'Search a source; no results is 200 []' })
  @ApiQuery({ name: 'q', required: true })
  async search(@Param('source') source: string, @Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query === '') {
      throw new ApiException(400, 'query-required', { message: 'q must not be empty' });
    }

    let results: SearchResultDto[];
    try {
      results = await this.scraper.search(source, query);
    } catch (err) {
      if (err instanceof PythonRunnerError && err.errorCode === NO_RESULTS) {
        return ok([]);
      }
      throw toScraperFailure(err);
    }

    return ok(
      results.map((r) => ({
        ...r,
        source: r.source ?? source,
        thumbnail: `/api/scraper/${encodeURIComponent(source)}/search-thumbnail/${encodeURIComponent(r.manga_id)}`,
      })),
    );
  }

  @Get(':source/search-thumbnail/:mangaId')
  @ApiOperation({ summary: "A search candidate's cover (image/jpeg) while it is cached" })
  searchThumbnail(
    @Param('source') source: string,
    @Param('mangaId') mangaId: string,
    @Res() res: Response,
  ): void {
    const cached = this.searchCache.get(source, mangaId);
    if (!cached) {
      res.status(404).json({ code: 404, error: 'thumbnail-not-found' });
      return;
    }
    res.type('image/jpeg').send(Buffer.from(cached.thumbnail, 'base64'));
  }

  @Get(':source/manga/:mangaId/metadata')
  @ApiOperation({ summary: 'Debug: chapter count and serialisation at the source' })
  async metadata(@Param('source') source: string, @Param('mangaId') mangaId: string) {
    const meta = assertScrapeOk(
      await callScraper(() => this.scraper.getMetadata(source, mangaId)),
    );
    return ok({ chapterCount: meta.chapterCount, serialization: meta.serialization });
  }

  @Get(':source/manga/:mangaId/chapters')
  @ApiOperation({ summary: 'Debug: chapter list at the source' })
  async chapters(@Param('source') source: string, @Param('mangaId') mangaId: string) {
    const list = assertScrapeOk(
      await callScraper(() => this.scraper.getChapters(source, mangaId)),
    );
    return ok(list.chapters);
  }

  @Get(':source/chapter-images')
  @ApiOperation({ summary: "Debug: a chapter's image URLs" })
  @ApiQuery({ name: 'url', required: true })
  async chapterImages(@Param('source') source: string, @Query('url') url: string) {
    const images = assertScrapeOk(
      await callScraper(() => this.scraper.getChapterImages(source, url)),
    );
    return ok({
      chapterTitle: images.chapterTitle,
      imageUrls: images.imageUrls,
      requestHeaders: images.requestHeaders,
    });
  }
}
