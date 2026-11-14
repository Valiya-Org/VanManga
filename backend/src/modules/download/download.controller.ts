import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/http/envelope';
import { LibraryService } from '../library/library.service';
import { assertScrapeOk, callScraper } from '../scraper/scrape-errors';
import { ScraperService } from '../scraper/scraper.service';
import { DownloadService } from './download.service';
import {
  SubmitFullDownloadDto,
  SubmitRedownloadDto,
} from './dto/submit-download.dto';

/** Canonical download-queue routes — docs/api-contract.md §3.3–3.4. */
@ApiTags('download')
@Controller()
export class DownloadController {
  constructor(
    private readonly download: DownloadService,
    private readonly scraper: ScraperService,
    private readonly library: LibraryService,
  ) {}

  @Post('download')
  @HttpCode(200)
  @ApiOperation({ summary: 'Queue a full download (new chapters from last_epi + 1)' })
  submit(@Body() body: SubmitFullDownloadDto) {
    return ok({ taskId: this.download.submitFullManga(body.manga_id).id });
  }

  @Post('download/chapters')
  @HttpCode(200)
  @ApiOperation({ summary: 'Queue a re-download of selected chapters' })
  redownload(@Body() body: SubmitRedownloadDto) {
    return ok({
      taskId: this.download.submitRedownload(body.manga_id, body.chapters).id,
    });
  }

  @Post('library/rezip')
  @HttpCode(200)
  @ApiTags('library')
  @ApiOperation({ summary: 'Queue a re-zip of every unzipped chapter on disk' })
  rezip() {
    return ok({ taskId: this.download.submitRezip().id });
  }

  @Get('download/queue')
  @ApiOperation({ summary: 'Queue snapshot { active, pending }' })
  queue() {
    return ok(this.download.snapshot());
  }

  @Get('download/current')
  @ApiOperation({ summary: 'The running task, or null' })
  current() {
    return ok(this.download.current() ?? null);
  }

  @Get('library/:mangaId/chapters')
  @ApiTags('library')
  @ApiOperation({ summary: "The source's chapter list for a library manga" })
  async chapters(@Param('mangaId') mangaId: string) {
    const manga = this.library.get(mangaId);
    const list = await callScraper(() =>
      this.scraper.getChapters(manga.source ?? 'dgmanga', mangaId),
    );
    return ok(assertScrapeOk(list).chapters);
  }
}
