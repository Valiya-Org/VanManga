import { Injectable, Logger } from '@nestjs/common';
import { MangaNotFoundException } from '../../common/http/api-exception';
import { OnEvent } from '@nestjs/event-emitter';
import {
  MANGA_ADDED,
  type MangaAddedEvent,
} from '../../common/events/app.events';
import { LibraryService } from '../library/library.service';
import { TaskQueueService } from './queue/task-queue.service';
import {
  ChapterPickDto,
} from './dto/submit-download.dto';
import {
  QueueSnapshot,
  TaskHandle,
  TaskKind,
  TaskSummaryDto,
} from './queue/task.types';

/** Public-facing facade over the queue + orchestrator. Controllers
 *  should never reach into the orchestrator directly. */
@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);

  constructor(
    private readonly queue: TaskQueueService,
    private readonly library: LibraryService,
  ) {}

  /** React to manga being added to library — auto-queue download. */
  @OnEvent(MANGA_ADDED)
  handleMangaAdded(event: MangaAddedEvent): void {
    this.logger.log(`Manga added event: queuing download for ${event.mangaId}`);
    this.submitFullManga(event.mangaId);
  }

  submitFullManga(mangaId: string): TaskHandle {
    if (!this.library.has(mangaId)) {
      throw new MangaNotFoundException(mangaId);
    }
    return this.queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId });
  }

  submitRedownload(mangaId: string, chapters: ChapterPickDto[]): TaskHandle {
    if (!this.library.has(mangaId)) {
      throw new MangaNotFoundException(mangaId);
    }
    return this.queue.enqueue({
      kind: TaskKind.REDOWNLOAD,
      mangaId,
      chapters,
    });
  }

  submitRezip(): TaskHandle {
    return this.queue.enqueue({ kind: TaskKind.REZIP });
  }

  current(): TaskSummaryDto | null {
    return this.queue.activeSummary();
  }

  pending(): TaskSummaryDto[] {
    return this.queue.pendingSummaries();
  }

  snapshot(): QueueSnapshot {
    return this.queue.snapshot();
  }

  isMangaBusy(mangaId: string): boolean {
    return this.queue.isMangaBusy(mangaId);
  }
}
