import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from '../../common/security/admin-token.guard';
import type { Response } from 'express';
import {
  MANGA_ADDED,
  type MangaAddedEvent,
} from '../../common/events/app.events';
import { ApiException } from '../../common/http/api-exception';
import { ok } from '../../common/http/envelope';
import { TaskQueueService } from '../download/queue/task-queue.service';
import { ThumbnailService } from '../filesystem/thumbnail.service';
import { LeanAddMangaDto, PaginationQueryDto } from './dto';
import { LibraryService } from './library.service';
import { toApiManga } from './manga-view';
import { sendThumbnail } from './send-thumbnail';

/** Canonical library routes — contract in docs/api-contract.md §3.3.
 *  POST /api/library/rezip lives in DownloadController (it queues a task). */
@ApiTags('library')
@Controller('library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly thumbnails: ThumbnailService,
    private readonly taskQueue: TaskQueueService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the library (Manga[])' })
  list() {
    return ok(this.library.list().map(toApiManga));
  }

  @Get('short')
  @ApiOperation({ summary: 'List { manga_id, manga_name } pairs' })
  short() {
    return ok(this.library.shortList());
  }

  @Get('paginate')
  @ApiOperation({ summary: 'One page of the library' })
  paginate(@Query() q: PaginationQueryDto) {
    const page = this.library.paginate(q.start, q.limit);
    return ok({ ...page, lib_paginate: page.lib_paginate.map(toApiManga) });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search within the library by name, artist or id' })
  @ApiQuery({ name: 'query', required: false })
  search(@Query('query') query?: string) {
    return ok(this.library.searchInLibrary(query ?? '').map(toApiManga));
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Add a manga from the search cache and queue its download',
    description:
      'Failures: 409 already-in-library (data.manga), 409 duplicate ' +
      '(data.duplicates), 410 search-expired.',
  })
  async add(@Body() body: LeanAddMangaDto) {
    const outcome = await this.library.addManga({
      manga_id: body.manga_id,
      source: body.source,
      submit_sign: body.submit_sign,
    });
    switch (outcome.status) {
      case 'cancelled':
        return ok({ status: 'cancelled' as const });
      case 'duplicate':
        throw new ApiException(409, 'duplicate', {
          message: 'Similar manga already in the library; resubmit with submit_sign=1',
          data: { duplicates: outcome.duplicates ?? [] },
        });
      case 'exists':
        throw new ApiException(409, 'already-in-library', {
          data: outcome.manga ? { manga: toApiManga(outcome.manga) } : undefined,
        });
      case 'expired':
        throw new ApiException(410, 'search-expired', {
          message: 'Candidate no longer in the search cache; search again',
        });
      case 'added': {
        const manga = outcome.manga!;
        this.eventEmitter.emit(MANGA_ADDED, {
          mangaId: manga.manga_id,
        } satisfies MangaAddedEvent);
        return ok({ status: 'added' as const, manga: toApiManga(manga) });
      }
    }
  }

  @Post(':mangaId/auto-update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle auto-update (download_switch)' })
  async toggle(@Param('mangaId') mangaId: string) {
    const next = await this.library.toggleAutoUpdate(mangaId);
    return ok({ currentDownloadStatus: next });
  }

  @Delete(':mangaId')
  @UseGuards(AdminTokenGuard)
  @ApiSecurity('admin-token')
  @ApiOperation({
    summary: 'Delete a manga and its download folder',
    description: 'Failures: 404 manga-not-found, 409 manga-busy, 500 delete-failed.',
  })
  async delete(@Param('mangaId') mangaId: string) {
    if (this.taskQueue.isMangaBusy(mangaId)) {
      throw new ApiException(409, 'manga-busy', {
        message: 'Manga is downloading or queued',
      });
    }
    if (!(await this.library.deleteManga(mangaId))) {
      throw new ApiException(500, 'delete-failed', {
        message: 'Could not remove the download folder; record kept',
      });
    }
    return ok(true);
  }

  @Get(':mangaId/thumbnail')
  @ApiOperation({ summary: 'Cover image (image/jpeg)' })
  async thumbnail(@Param('mangaId') mangaId: string, @Res() res: Response) {
    const notFound = { code: 404, error: 'thumbnail-not-found' };
    if (!this.library.has(mangaId)) {
      res.status(404).json(notFound);
      return;
    }
    await sendThumbnail(this.thumbnails, mangaId, res, notFound);
  }
}
