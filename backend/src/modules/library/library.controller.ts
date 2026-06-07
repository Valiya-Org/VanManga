import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Response } from 'express';
import {
  MANGA_ADDED,
  type MangaAddedEvent,
} from '../../common/events/app.events';
import { TaskQueueService } from '../download/queue/task-queue.service';
import { ThumbnailService } from '../filesystem/thumbnail.service';
import { AddMangaDto, ConfirmMangaLegacyDto, PaginationQueryDto } from './dto';
import { LibraryService } from './library.service';

/** Library REST surface.
 *
 *  Each handler is mounted at TWO paths:
 *   - `/api/library/*` — source-agnostic, future-facing
 *   - `/api/dogemanga/*` — legacy path the Vue frontend still calls */
@Controller()
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly thumbnails: ThumbnailService,
    private readonly taskQueue: TaskQueueService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------- list / pagination ----------

  @Get('library')
  listGet() {
    return { data: this.library.list(), code: 200 };
  }

  /** Legacy: POST /api/dogemanga/lib */
  @Post('dogemanga/lib')
  listLegacy() {
    return { data: this.library.list(), code: 200 };
  }

  @Get('library/short')
  shortGet() {
    return { data: this.library.shortList(), code: 200 };
  }

  @Post('dogemanga/shortlib')
  shortLegacy() {
    return { data: this.library.shortList(), code: 200 };
  }

  @Get('library/paginate')
  paginateGet(@Query() q: PaginationQueryDto) {
    return { data: this.library.paginate(q.start, q.limit), code: 200 };
  }

  @Post('dogemanga/libpagination')
  paginateLegacy(@Body() body: PaginationQueryDto) {
    const start = body.start ?? 1;
    const limit = body.limit ?? 10;
    return { data: this.library.paginate(start, limit), code: 200 };
  }

  /** Search WITHIN the existing library (borrowed from 2.1-dev). */
  @Get('library/search')
  searchGet(@Query('query') query: string) {
    return { data: this.library.searchInLibrary(query ?? ''), code: 200 };
  }

  @Get('dogemanga/libsearch')
  searchLegacy(@Query('query') query: string) {
    return { data: this.library.searchInLibrary(query ?? ''), code: 200 };
  }

  // ---------- add / submit ----------

  @Post('library')
  async addNew(@Body() body: AddMangaDto) {
    return this.runAdd(body);
  }

  @Post('dogemanga/confirm')
  async addLegacy(@Body() body: ConfirmMangaLegacyDto) {
    // The Vue frontend nests the candidate under `manga_object` and sends
    // `submit_sign` as a sibling; flatten to the AddMangaDto shape runAdd expects.
    return this.runAdd({ ...body.manga_object, submit_sign: body.submit_sign });
  }

  private async runAdd(body: AddMangaDto) {
    const outcome = await this.library.addManga(body);
    switch (outcome.status) {
      case 'cancelled':
        return { data: 'cancelled', code: 200 };
      case 'duplicate':
        return { data: { duplicates: outcome.duplicates }, code: 409 };
      case 'exists':
        return { data: 'already-in-library', code: 200 };
      case 'added':
        // Notify DownloadService to queue download via event —
        // mirrors Flask DogePost which calls Q.add_task() after adding.
        this.eventEmitter.emit(MANGA_ADDED, {
          mangaId: outcome.manga!.manga_id,
        } satisfies MangaAddedEvent);
        return { data: 'submitted', code: 200 };
    }
  }

  // ---------- per-manga state ----------

  @Post('library/:mangaId/auto-update')
  async toggleNew(@Param('mangaId') mangaId: string) {
    const next = await this.library.toggleAutoUpdate(mangaId);
    return { data: { currentDownloadStatus: next }, code: 200 };
  }

  @Post('dogemanga/downloadswitch')
  async toggleLegacy(@Body('manga_id') mangaId: string) {
    if (!mangaId) throw new NotFoundException('manga_id missing');
    const next = await this.library.toggleAutoUpdate(mangaId);
    return { data: { currentDownloadStatus: next }, code: 200 };
  }

  @Delete('library/:mangaId')
  async deleteNew(@Param('mangaId') mangaId: string) {
    return this.runDelete(mangaId);
  }

  @Delete('dogemanga/deletemanga')
  async deleteLegacy(@Body('manga_id') mangaId: string) {
    if (!mangaId) throw new NotFoundException('manga_id missing');
    return this.runDelete(mangaId);
  }

  private async runDelete(mangaId: string) {
    if (this.taskQueue.isMangaBusy(mangaId)) {
      throw new ConflictException({ data: false, code: 434 });
    }
    const ok = await this.library.deleteManga(mangaId);
    return { data: ok, code: ok ? 200 : 424 };
  }

  // ---------- thumbnail ----------

  @Get('library/:mangaId/thumbnail')
  async thumbnailNew(
    @Param('mangaId') mangaId: string,
    @Res() res: Response,
  ) {
    return this.serveThumbnail(mangaId, res);
  }

  @Get('dogemanga/thumbnail')
  async thumbnailLegacy(@Query('mid') mid: string, @Res() res: Response) {
    return this.serveThumbnail(mid, res);
  }

  private async serveThumbnail(
    mangaId: string | undefined,
    res: Response,
  ): Promise<void> {
    if (!mangaId) {
      res.status(HttpStatus.NOT_FOUND).json({ data: false, code: 404 });
      return;
    }
    try {
      const path = await this.thumbnails.getThumbnailPath(mangaId);
      res.sendFile(path);
    } catch {
      res.status(HttpStatus.NOT_FOUND).json({ data: false, code: 404 });
    }
  }
}
