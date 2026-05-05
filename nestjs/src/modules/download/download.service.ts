import { Injectable, NotFoundException } from '@nestjs/common';
import { LibraryService } from '../library/library.service';
import { TaskQueueService } from './queue/task-queue.service';
import {
  ChapterPickDto,
} from './dto/submit-download.dto';
import {
  TaskHandle,
  TaskKind,
  TaskSummaryDto,
} from './queue/task.types';

/** Public-facing facade over the queue + orchestrator. Controllers
 *  should never reach into the orchestrator directly. */
@Injectable()
export class DownloadService {
  constructor(
    private readonly queue: TaskQueueService,
    private readonly library: LibraryService,
  ) {}

  submitFullManga(mangaId: string): TaskHandle {
    if (!this.library.has(mangaId)) {
      throw new NotFoundException(`Unknown manga: ${mangaId}`);
    }
    return this.queue.enqueue({ kind: TaskKind.FULL_MANGA, mangaId });
  }

  submitRedownload(mangaId: string, chapters: ChapterPickDto[]): TaskHandle {
    if (!this.library.has(mangaId)) {
      throw new NotFoundException(`Unknown manga: ${mangaId}`);
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

  isMangaBusy(mangaId: string): boolean {
    return this.queue.isMangaBusy(mangaId);
  }
}
