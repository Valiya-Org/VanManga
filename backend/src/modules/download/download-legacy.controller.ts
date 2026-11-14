import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LibraryService } from '../library/library.service';
import { ScraperService } from '../scraper/scraper.service';
import { DownloadService } from './download.service';
import { ChapterPickDto } from './dto/submit-download.dto';

/** Legacy `/api/dogemanga/*` download routes, unchanged for the current
 *  frontend (see legacy-contract.spec.ts). Deleted in P4.
 *
 *  There is deliberately NO `/dogemanga/confirmdownload`: the legacy
 *  `/dogemanga/confirm` add already queues the download via MANGA_ADDED,
 *  like Flask's DogePost; a second route would double-queue. */
@ApiExcludeController()
@Controller('dogemanga')
export class DownloadLegacyController {
  constructor(
    private readonly download: DownloadService,
    private readonly scraper: ScraperService,
    private readonly library: LibraryService,
  ) {}

  /** Accepts { manga_id, selected_array } where selected_array is a
   *  (possibly stringified) list of [title, link] tuples or objects. */
  @Post('redownload')
  redownload(@Body() body: Record<string, unknown>) {
    const mangaId = String(body.manga_id ?? '');
    const raw = body.selected_array;
    let chapters: ChapterPickDto[];

    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
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

    const handle = this.download.submitRedownload(mangaId, chapters);
    return { data: { taskId: handle.id }, code: 200 };
  }

  @Get('rezip')
  rezip() {
    const handle = this.download.submitRezip();
    return { data: 'Re zip downloaded document begin', code: 200, taskId: handle.id };
  }

  @Get('cdl')
  current() {
    return { data: this.download.current()?.mangaId ?? '', code: 200 };
  }

  @Get('dlqueue')
  queue() {
    return { data: this.download.pending(), code: 200 };
  }

  @Get('confirmmanga')
  async chapters(@Query('manga_id') mangaId: string) {
    if (!mangaId) return { data: 'manga_id missing', code: 400 };
    const manga = this.library.get(mangaId);
    const list = await this.scraper.getChapters(manga.source ?? 'dgmanga', mangaId);
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
