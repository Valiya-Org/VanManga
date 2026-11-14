import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ScraperService } from './scraper.service';

/** Legacy search route used by the Vue frontend.
 *  GET /api/dogemanga/search?manga_name=xxx
 *
 *  The new route is /api/scraper/:source/search?q=xxx but the
 *  frontend hardcodes /api/dogemanga/search, so we keep this until P4. */
@ApiExcludeController()
@Controller()
export class ScraperLegacyController {
  constructor(private readonly scraper: ScraperService) {}

  @Get('dogemanga/search')
  async search(@Query('manga_name') mangaName: string) {
    if (!mangaName || mangaName.trim() === '') {
      return { data: 'manga_name should not be empty!', code: 456 };
    }

    try {
      const results = await this.scraper.search('dgmanga', mangaName);

      if (!results || (Array.isArray(results) && results.length === 0)) {
        return { data: 'No manga searched.', code: 457 };
      }

      return { data: results, code: 200 };
    } catch {
      return { data: 'No manga searched.', code: 457 };
    }
  }
}
