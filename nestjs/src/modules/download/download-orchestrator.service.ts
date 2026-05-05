import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { EventsGateway } from '../events/events.gateway';
import { ArchiveService } from '../filesystem/archive.service';
import { FilesystemService } from '../filesystem/filesystem.service';
import { LibraryService } from '../library/library.service';
import type { Manga } from '../library/entities/manga.entity';
import {
  ChapterDto,
  ChapterListResultDto,
  MangaMetadataDto,
} from '../scraper/dto';
import { ScraperService } from '../scraper/scraper.service';
import { ImageDownloaderService } from './image-downloader.service';
import { TaskQueueService } from './queue/task-queue.service';
import {
  FullMangaPayload,
  RedownloadPayload,
  RezipPayload,
  TaskKind,
  TaskPayload,
} from './queue/task.types';

/** Owns the per-task workflow: meta → chapters → images → zip →
 *  library update → events → kavita scan. Replaces main.py:
 *   - confirm_comic_task (TaskKind.FULL_MANGA)
 *   - download_chapter_task (TaskKind.REDOWNLOAD)
 *   - re_zip_task (TaskKind.REZIP)
 *
 *  Self-registers with TaskQueueService on module init so the queue
 *  can drive it without holding a hard reference. */
@Injectable()
export class DownloadOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(DownloadOrchestratorService.name);
  private readonly chapterConcurrency: number;

  constructor(
    private readonly queue: TaskQueueService,
    private readonly scraper: ScraperService,
    private readonly imageDownloader: ImageDownloaderService,
    private readonly fsService: FilesystemService,
    private readonly archive: ArchiveService,
    private readonly library: LibraryService,
    private readonly events: EventsGateway,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    this.chapterConcurrency = this.config.get('concurrency.workers', {
      infer: true,
    });
  }

  onModuleInit(): void {
    this.queue.registerExecutor((payload) => this.dispatch(payload));
  }

  private dispatch(payload: TaskPayload): Promise<void> {
    switch (payload.kind) {
      case TaskKind.FULL_MANGA:
        return this.runFullManga(payload);
      case TaskKind.REDOWNLOAD:
        return this.runRedownload(payload);
      case TaskKind.REZIP:
        return this.runRezip(payload);
    }
  }

  // -------------------------------------------- FULL_MANGA

  private async runFullManga(payload: FullMangaPayload): Promise<void> {
    const manga = this.library.get(payload.mangaId);
    const sourceName = manga.source ?? 'dgmanga';

    const meta = await this.scraper.getMetadata(sourceName, manga.manga_id);
    if (await this.handleSentinel(meta, manga)) return;

    if (manga.last_epi > meta.chapterCount) {
      this.logger.log(`${manga.manga_id}: nothing to download (up to date)`);
      return;
    }

    this.events.emitDownloading({ mangaId: manga.manga_id });

    const list = await this.scraper.getChapters(sourceName, manga.manga_id);
    if (await this.handleChapterListSentinel(list, manga)) return;

    const start = manga.last_epi <= 1 ? 1 : manga.last_epi + 1;
    const wanted = list.chapters.filter((c) => c.index >= start);

    if (wanted.length === 0) {
      this.logger.log(`${manga.manga_id}: no new chapters after filter`);
    } else {
      await this.processChapters(manga, sourceName, wanted);
    }

    // mark completion + carry-forward serialization on first finish
    const patch: Partial<Manga> = {
      completed: true,
      serialization: meta.serialization,
    };
    if (!manga.completed) {
      patch.download_switch = meta.serialization;
    }
    await this.library.patch(manga.manga_id, patch);

    this.events.emitComplete({
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
      success: true,
    });

    // Kavita scan hook — wired by KavitaService in Stage 5.
    // Until then, this is a no-op.
  }

  // -------------------------------------------- REDOWNLOAD

  private async runRedownload(payload: RedownloadPayload): Promise<void> {
    const manga = this.library.get(payload.mangaId);
    const sourceName = manga.source ?? 'dgmanga';

    this.events.emitDownloading({ mangaId: manga.manga_id });
    await this.processChapters(manga, sourceName, payload.chapters, {
      updateLastEpi: false,
    });
    this.events.emitComplete({
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
      success: true,
    });
  }

  // -------------------------------------------- REZIP

  private async runRezip(_payload: RezipPayload): Promise<void> {
    const result = await this.archive.rezipDownloadRoot();
    this.logger.log(
      `Rezip done: scanned ${result.scannedManga} manga, zipped ${result.zippedChapters} chapters, skipped ${result.skipped.length}, errors ${result.errors.length}`,
    );
    this.events.emitScanCompleted();
  }

  // -------------------------------------------- Chapter loop

  private async processChapters(
    manga: Manga,
    sourceName: string,
    chapters: ChapterDto[],
    options: { updateLastEpi?: boolean } = {},
  ): Promise<void> {
    const updateLastEpi = options.updateLastEpi ?? true;
    const tree = await this.fsService.ensureMangaTree(
      manga.manga_name,
      manga.manga_id,
    );

    // Scrape image-URL lists for all chapters in parallel (bounded),
    // then download each chapter's images in parallel.
    const queue = chapters.slice();
    const inFlight = new Set<Promise<void>>();
    const failedChapters: string[] = [];

    while (queue.length > 0 || inFlight.size > 0) {
      while (queue.length > 0 && inFlight.size < this.chapterConcurrency) {
        const chapter = queue.shift()!;
        const task = this.processOneChapter(
          manga,
          sourceName,
          chapter,
          tree.innerDir,
          updateLastEpi,
        )
          .catch((err) => {
            failedChapters.push(chapter.title);
            this.logger.error(
              `Chapter '${chapter.title}' failed: ${(err as Error).message}`,
            );
          })
          .finally(() => {
            inFlight.delete(task);
          });
        inFlight.add(task);
      }
      if (inFlight.size > 0) {
        await Promise.race(inFlight);
      }
    }

    if (failedChapters.length > 0) {
      this.logger.warn(
        `${manga.manga_id}: ${failedChapters.length} chapter(s) failed: ${failedChapters.join(', ')}`,
      );
    }
  }

  private async processOneChapter(
    manga: Manga,
    sourceName: string,
    chapter: ChapterDto,
    innerDir: string,
    updateLastEpi: boolean,
  ): Promise<void> {
    const safeTitle = this.sanitiseTitle(chapter.title);
    const chapterDir = this.fsService.chapterDir(innerDir, safeTitle);

    this.events.emitProgress({
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
      chapterTitle: safeTitle,
      current: chapter.index,
      total: 0,
      status: 'downloading',
    });

    const images = await this.scraper.getChapterImages(sourceName, chapter.url);
    if (images.errorCode) {
      this.events.emitProgress({
        mangaId: manga.manga_id,
        mangaName: manga.manga_name,
        chapterTitle: safeTitle,
        current: chapter.index,
        total: 0,
        status: 'failed',
        message: `errorCode=${images.errorCode}`,
      });
      throw new Error(
        `chapter scrape returned errorCode=${images.errorCode}`,
      );
    }

    const jobs = images.imageUrls.map((url, i) => ({
      url,
      filename: `${this.padPage(i + 1)}.jpg`,
      extraHeaders: images.requestHeaders,
    }));

    const result = await this.imageDownloader.downloadChapter(chapterDir, jobs);
    if (result.failed.length > 0) {
      this.logger.warn(
        `Chapter '${safeTitle}': ${result.failed.length}/${jobs.length} images failed`,
      );
    }

    // Zip on success only (matches modules/DGmanga.py:download_img which
    // zips after the inner retry loop)
    await this.archive.zipChapter(chapterDir);

    if (updateLastEpi) {
      const current = this.library.get(manga.manga_id);
      if (chapter.index > current.last_epi) {
        await this.library.patch(manga.manga_id, {
          last_epi: chapter.index,
          last_epi_name: safeTitle,
        });
      }
    }

    this.events.emitProgress({
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
      chapterTitle: safeTitle,
      current: chapter.index,
      total: jobs.length,
      status: 'finished',
    });
  }

  // -------------------------------------------- helpers

  /** Returns true if metadata signals an unrecoverable condition we
   *  should bail from (DMCA, CF wall, scraper error). */
  private async handleSentinel(
    meta: MangaMetadataDto,
    manga: Manga,
  ): Promise<boolean> {
    if (meta.errorCode === 504) {
      await this.handleDmca(manga);
      return true;
    }
    if (meta.errorCode === 501) {
      this.logger.warn(
        `${manga.manga_id}: scraper hit CF wall (501); skipping`,
      );
      return true;
    }
    return false;
  }

  private async handleChapterListSentinel(
    list: ChapterListResultDto,
    manga: Manga,
  ): Promise<boolean> {
    if (list.errorCode === 504) {
      await this.handleDmca(manga);
      return true;
    }
    if (list.errorCode === 501) {
      this.logger.warn(
        `${manga.manga_id}: chapter list scrape hit CF wall (501); skipping`,
      );
      return true;
    }
    return false;
  }

  private async handleDmca(manga: Manga): Promise<void> {
    this.logger.warn(
      `${manga.manga_id} (${manga.manga_name}) is DMCA-restricted; removing from library`,
    );
    try {
      await this.library.deleteManga(manga.manga_id);
    } catch (err) {
      this.logger.error(
        `Failed to delete DMCA'd manga ${manga.manga_id}: ${(err as Error).message}`,
      );
    }
    this.events.emitDmcaAlert({
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
    });
  }

  /** Replaces utils/chapter_title_reformat.py call site — the Python
   *  scraper already normalises titles before they reach NestJS, but
   *  we still strip filesystem-hostile characters defensively. */
  private sanitiseTitle(title: string): string {
    return title
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private padPage(n: number): string {
    return n.toString().padStart(3, '0');
  }
}
