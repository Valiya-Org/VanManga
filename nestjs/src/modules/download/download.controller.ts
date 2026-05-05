import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ScraperService } from '../scraper/scraper.service';
import { LibraryService } from '../library/library.service';
import { DownloadService } from './download.service';
import {
  ChapterPickDto,
  SubmitFullDownloadDto,
  SubmitRedownloadDto,
} from './dto/submit-download.dto';

/** Download REST surface. Like LibraryController, mounts each handler
 *  at TWO paths so the legacy Vue frontend keeps working unchanged. */
@Controller()
export class DownloadController {
  constructor(
    private readonly download: DownloadService,
    private readonly scraper: ScraperService,
    private readonly library: LibraryService,
  ) {}

  // ---------- submit full manga ----------

  @Post('download')
  submitNew(@Body() body: SubmitFullDownloadDto) {
    const handle = this.download.submitFullManga(body.manga_id);
    return { data: { taskId: handle.id }, code: 200 };
  }

  /** Legacy: confirm acted as both library-add AND download trigger.
   *  We split: LibraryController handles the add; this endpoint queues
   *  the download for an already-added manga. The Vue frontend invokes
   *  both in sequence. */
  @Post('dogemanga/confirmdownload')
  submitLegacy(@Body() body: SubmitFullDownloadDto) {
    const handle = this.download.submitFullManga(body.manga_id);
    return { data: { taskId: handle.id }, code: 200 };
  }

  // ---------- redownload chapters ----------

  @Post('download/chapters')
  redownloadNew(@Body() body: SubmitRedownloadDto) {
    return this.runRedownload(body.manga_id, body.chapters);
  }

  /** Legacy: POST /api/dogemanga/redownload accepts { manga_id, selected_array }
   *  where selected_array is a stringified list of [title, link] tuples.
   *  We accept both shapes. */
  @Post('dogemanga/redownload')
  async redownloadLegacy(@Body() body: Record<string, unknown>) {
    const mangaId = String(body.manga_id ?? '');
    const raw = body.selected_array;
    let chapters: ChapterPickDto[];

    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) {
        return { data: 'selected_array must be an array', code: 400 };
      }
      chapters = parsed.map((item: unknown, idx: number) => {
        if (Array.isArray(item)) {
          return { index: idx + 1, title: String(item[0]), url: String(item[1]) };
        }
        const obj = item as Record<string, unknown>;
        return {
          index: Number(obj.index ?? idx + 1),
          title: String(obj.chapter_title ?? obj.title ?? ''),
          url: String(obj.chapter_link ?? obj.url ?? ''),
        };
      });
    } catch (err) {
      return {
        data: `failed to parse selected_array: ${(err as Error).message}`,
        code: 400,
      };
    }

    return this.runRedownload(mangaId, chapters);
  }

  private runRedownload(mangaId: string, chapters: ChapterPickDto[]) {
    const handle = this.download.submitRedownload(mangaId, chapters);
    return { data: { taskId: handle.id }, code: 200 };
  }

  // ---------- rezip ----------

  @Post('library/rezip')
  rezipNew() {
    const handle = this.download.submitRezip();
    return { data: { taskId: handle.id, message: 'rezip enqueued' }, code: 200 };
  }

  @Get('dogemanga/rezip')
  rezipLegacy() {
    const handle = this.download.submitRezip();
    return { data: 'Re zip downloaded document begin', code: 200, taskId: handle.id };
  }

  // ---------- queue introspection ----------

  @Get('download/current')
  currentNew() {
    const active = this.download.current();
    return { data: active?.mangaId ?? '', code: 200 };
  }

  @Get('dogemanga/cdl')
  currentLegacy() {
    const active = this.download.current();
    return { data: active?.mangaId ?? '', code: 200 };
  }

  @Get('download/queue')
  queueNew() {
    return { data: this.download.pending(), code: 200 };
  }

  @Get('dogemanga/dlqueue')
  queueLegacy() {
    return { data: this.download.pending(), code: 200 };
  }

  // ---------- chapter list passthrough (for the redownload picker UI) ----------

  /** Replaces /api/dogemanga/confirmmanga — returns the full chapter
   *  list for an already-added manga so the Vue frontend can render
   *  a chapter picker before submitting a redownload. */
  @Get('library/:mangaId/chapters')
  async chaptersNew(
    @Query('manga_id') mid: string | undefined,
  ) {
    return this.fetchChapters(mid);
  }

  @Get('dogemanga/confirmmanga')
  async chaptersLegacy(@Query('manga_id') mangaId: string) {
    return this.fetchChapters(mangaId);
  }

  private async fetchChapters(mangaId: string | undefined) {
    if (!mangaId) return { data: 'manga_id missing', code: 400 };
    const manga = this.library.get(mangaId);
    const list = await this.scraper.getChapters(
      manga.source ?? 'dgmanga',
      mangaId,
    );
    if (list.errorCode === 501) {
      return { data: 'error', code: 501 };
    }
    if (list.errorCode === 504) {
      return { data: 'dmca', code: 504 };
    }
    // legacy frontend expects [{chapter_title, chapter_link}, ...]
    const legacy = list.chapters.map((c) => ({
      chapter_title: c.title,
      chapter_link: c.url,
    }));
    return { data: legacy, code: 200 };
  }
}
