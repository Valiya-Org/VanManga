import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiExcludeController } from '@nestjs/swagger';
import { AdminTokenGuard } from '../../common/security/admin-token.guard';
import type { Response } from 'express';
import {
  MANGA_ADDED,
  type MangaAddedEvent,
} from '../../common/events/app.events';
import { TaskQueueService } from '../download/queue/task-queue.service';
import { ThumbnailService } from '../filesystem/thumbnail.service';
import { AddMangaDto, ConfirmMangaLegacyDto, PaginationQueryDto } from './dto';
import { LibraryService } from './library.service';
import { sendThumbnail } from './send-thumbnail';

/** Legacy `/api/dogemanga/*` library routes, kept byte-for-byte for the
 *  current frontend (see legacy-contract.spec.ts). Deleted in P4; new
 *  clients use LibraryController. */
@ApiExcludeController()
@Controller('dogemanga')
export class LibraryLegacyController {
  constructor(
    private readonly library: LibraryService,
    private readonly thumbnails: ThumbnailService,
    private readonly taskQueue: TaskQueueService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('lib')
  list() {
    return { data: this.library.list(), code: 200 };
  }

  @Post('shortlib')
  short() {
    return { data: this.library.shortList(), code: 200 };
  }

  @Post('libpagination')
  paginate(@Body() body: PaginationQueryDto) {
    const start = body.start ?? 1;
    const limit = body.limit ?? 10;
    return { data: this.library.paginate(start, limit), code: 200 };
  }

  @Get('libsearch')
  search(@Query('query') query: string) {
    return { data: this.library.searchInLibrary(query ?? ''), code: 200 };
  }

  @Post('confirm')
  async add(@Body() body: ConfirmMangaLegacyDto) {
    // The Vue frontend nests the candidate under `manga_object` and sends
    // `submit_sign` as a sibling; flatten to the AddMangaDto shape.
    const input: AddMangaDto = { ...body.manga_object, submit_sign: body.submit_sign };
    const outcome = await this.library.addManga(input);
    switch (outcome.status) {
      case 'cancelled':
        return { data: 'cancelled', code: 200 };
      case 'duplicate':
        return { data: { duplicates: outcome.duplicates }, code: 409 };
      case 'exists':
        return { data: 'already-in-library', code: 200 };
      case 'expired':
        return { data: 'search-expired', code: 410 };
      case 'added':
        // Mirrors Flask DogePost, which called Q.add_task() after adding.
        this.eventEmitter.emit(MANGA_ADDED, {
          mangaId: outcome.manga!.manga_id,
        } satisfies MangaAddedEvent);
        return { data: 'submitted', code: 200 };
    }
  }

  @Post('downloadswitch')
  async toggle(@Body('manga_id') mangaId: string) {
    if (!mangaId) throw new NotFoundException('manga_id missing');
    const next = await this.library.toggleAutoUpdate(mangaId);
    return { data: { currentDownloadStatus: next }, code: 200 };
  }

  @Delete('deletemanga')
  @UseGuards(AdminTokenGuard)
  async delete(@Body('manga_id') mangaId: string) {
    if (!mangaId) throw new NotFoundException('manga_id missing');
    if (this.taskQueue.isMangaBusy(mangaId)) {
      throw new ConflictException({ data: false, code: 434 });
    }
    const ok = await this.library.deleteManga(mangaId);
    return { data: ok, code: ok ? 200 : 424 };
  }

  @Get('thumbnail')
  async thumbnail(@Query('mid') mid: string, @Res() res: Response) {
    if (!mid) {
      res.status(404).json({ data: false, code: 404 });
      return;
    }
    await sendThumbnail(this.thumbnails, mid, res, { data: false, code: 404 });
  }
}
