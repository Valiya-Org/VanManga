import { Controller, Get, Param, Query } from '@nestjs/common';
import { ScraperService } from './scraper.service';

/** Debug-only routes that expose the scraper through HTTP — useful for
 *  validating the Python subprocess pipeline before the LibraryModule
 *  and DownloadModule land. Real production routes will live in those
 *  feature modules. */
@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraper: ScraperService) {}

  @Get('sources')
  listSources() {
    return { data: this.scraper.listSources(), code: 200 };
  }

  @Get(':source/search')
  search(@Param('source') source: string, @Query('q') q: string) {
    return this.scraper.search(source, q);
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
