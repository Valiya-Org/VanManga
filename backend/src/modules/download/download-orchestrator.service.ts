import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../../config/configuration';
import {
  DOWNLOAD_COMPLETED,
  type DownloadCompletedEvent,
} from '../../common/events/app.events';
import { EventsGateway } from '../events/events.gateway';
import { ArchiveService } from '../filesystem/archive.service';
import { FilesystemService } from '../filesystem/filesystem.service';
import { LibraryService } from '../library/library.service';
import type { Manga } from '../library/entities/manga.entity';
import { toApiManga, type ApiManga } from '../library/manga-view';
import type { DownloadTaskKind } from '../events/events.types';
import {
  ChapterDto,
  ChapterListResultDto,
  MangaMetadataDto,
} from '../scraper/dto';
import { ScraperService } from '../scraper/scraper.service';
import { reformatChapterTitle } from './chapter-title';
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
  /** A chapter with this many failed images is abandoned rather than
   *  zipped — same threshold as modules/DGmanga.py:download_img. */
  private readonly maxFailedImagesPerChapter = 10;
  /** Retries for a chapter page that answers 429, and the base wait between
   *  them (attempt N waits N x base + jitter). Mirrors Error_dict in main.py:
   *  g_wait_time=40s, g_error_count capped at 5. */
  private readonly maxChapterRateLimitRetries = 5;
  private readonly chapterRateLimitBaseMs = 40_000;

  constructor(
    private readonly queue: TaskQueueService,
    private readonly scraper: ScraperService,
    private readonly imageDownloader: ImageDownloaderService,
    private readonly fsService: FilesystemService,
    private readonly archive: ArchiveService,
    private readonly library: LibraryService,
    private readonly eventEmitter: EventEmitter2,
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

    this.announceStart(manga.manga_id, 'full-manga');
    this.logger.log(
      `=== DOWNLOAD START: ${manga.manga_name} (${manga.manga_id}) ===`,
    );

    let total = 0;
    let failedCount = 0;
    try {
      const list = await this.scraper.getChapters(sourceName, manga.manga_id);
      if (await this.handleChapterListSentinel(list, manga)) {
        this.announceEnd(manga.manga_id, 'full-manga', 'failed', 0, 0);
        return;
      }

      // Re-running a task (e.g. restored after a restart) resumes here:
      // chapters up to last_epi are already recorded and are skipped.
      const start = manga.last_epi <= 1 ? 1 : manga.last_epi + 1;
      const wanted = list.chapters.filter((c) => c.index >= start);
      total = wanted.length;

      if (wanted.length === 0) {
        this.logger.log(`${manga.manga_id}: no new chapters after filter`);
      } else {
        failedCount = await this.processChapters(manga, sourceName, wanted);
      }
    } catch (err) {
      this.announceEnd(manga.manga_id, 'full-manga', 'failed', total, failedCount);
      throw err;
    }

    // Nothing at all came down (source blocked, layout changed, ...). Leave
    // the record untouched so the next scan retries it: marking it completed
    // would also copy `serialization` into download_switch, and a finished
    // series would then never be scanned again.
    if (total > 0 && failedCount === total) {
      this.logger.error(
        `=== DOWNLOAD FAILED: ${manga.manga_name} (${manga.manga_id}) — ` +
          `all ${total} chapter(s) failed ===`,
      );
      this.announceEnd(manga.manga_id, 'full-manga', 'failed', total, failedCount);
      return;
    }

    // mark completion + carry-forward serialization on first finish
    const patch: Partial<Manga> = {
      completed: true,
      serialization: meta.serialization,
    };
    // updated_at drives "recently updated" ordering: only a run that brought
    // something down moves it (a no-op run of an up-to-date manga must not).
    if (total > 0 && failedCount < total) {
      patch.updated_at = this.nowSeconds();
    }
    if (!manga.completed) {
      patch.download_switch = meta.serialization;
    }
    await this.library.patch(manga.manga_id, patch);

    this.announceEnd(manga.manga_id, 'full-manga', 'done', total, failedCount);
    this.logger.log(
      `=== DOWNLOAD DONE: ${manga.manga_name} (${manga.manga_id}) ===`,
    );

    // Notify listeners (KavitaService) that download finished
    this.eventEmitter.emit(DOWNLOAD_COMPLETED, {
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
    } satisfies DownloadCompletedEvent);
  }

  // -------------------------------------------- REDOWNLOAD

  private async runRedownload(payload: RedownloadPayload): Promise<void> {
    const manga = this.library.get(payload.mangaId);
    const sourceName = manga.source ?? 'dgmanga';

    const total = payload.chapters.length;
    this.announceStart(manga.manga_id, 'redownload');
    this.logger.log(
      `=== REDOWNLOAD START: ${manga.manga_name} (${manga.manga_id}), ` +
        `${total} chapter(s) ===`,
    );
    let failedCount: number;
    try {
      failedCount = await this.processChapters(manga, sourceName, payload.chapters, {
        updateLastEpi: false,
      });
      // Same rule as runFullManga: only a run that downloaded something.
      if (total > 0 && failedCount < total) {
        await this.library.patch(manga.manga_id, { updated_at: this.nowSeconds() });
      }
    } catch (err) {
      this.announceEnd(manga.manga_id, 'redownload', 'failed', total, total);
      throw err;
    }
    this.announceEnd(
      manga.manga_id,
      'redownload',
      total > 0 && failedCount === total ? 'failed' : 'done',
      total,
      failedCount,
    );
    this.logger.log(
      `=== REDOWNLOAD DONE: ${manga.manga_name} (${manga.manga_id}) ===`,
    );

    // main.py:download_chapter_task also triggered a Kavita folder scan.
    this.eventEmitter.emit(DOWNLOAD_COMPLETED, {
      mangaId: manga.manga_id,
      mangaName: manga.manga_name,
    } satisfies DownloadCompletedEvent);
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
  ): Promise<number> {
    const updateLastEpi = options.updateLastEpi ?? true;
    // The manga may have been deleted while this task was scraping (the
    // delete's busy check ran before the task was queued): do not recreate
    // its folder as an orphan.
    if (!this.library.has(manga.manga_id)) {
      throw new Error(`${manga.manga_id} was removed from the library; not downloading`);
    }
    const tree = await this.fsService.ensureMangaTree(
      manga.manga_name,
      manga.manga_id,
    );

    // Scrape image-URL lists for all chapters in parallel (bounded),
    // then download each chapter's images in parallel.
    const queue = chapters.slice();
    const inFlight = new Set<Promise<void>>();
    const failedChapters: string[] = [];
    const total = chapters.length;
    let done = 0;
    let started = 0;

    const progress = () =>
      this.events.emitDownloadProgress({
        manga_id: manga.manga_id,
        chapters_total: total,
        chapters_done: done,
        chapters_failed: failedChapters.length,
      });
    progress();

    while (queue.length > 0 || inFlight.size > 0) {
      while (queue.length > 0 && inFlight.size < this.chapterConcurrency) {
        // Space out chapter starts like Flask did (2–5 s), to stay under
        // the source's rate limit.
        if (started > 0) await this.sleep(this.chapterStartDelayMs());
        started += 1;
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
            done += 1;
            progress();
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
    return failedChapters.length;
  }

  private async processOneChapter(
    manga: Manga,
    sourceName: string,
    chapter: ChapterDto,
    innerDir: string,
    updateLastEpi: boolean,
  ): Promise<void> {
    const safeTitle = this.sanitiseTitle(
      reformatChapterTitle(chapter.title),
      chapter.index,
    );
    const chapterDir = this.fsService.chapterDir(innerDir, safeTitle);

    const images = await this.scrapeChapterImages(
      sourceName,
      chapter.url,
      safeTitle,
    );

    const jobs = images.imageUrls.map((url, i) => ({
      url,
      filename: `${this.padPage(i + 1)}.jpg`,
      extraHeaders: images.requestHeaders,
    }));

    this.logger.log(
      `Chapter '${safeTitle}': downloading ${jobs.length} image(s)...`,
    );

    const result = await this.imageDownloader.downloadChapter(chapterDir, jobs, {
      label: `Chapter '${safeTitle}'`,
    });
    if (result.failed.length >= this.maxFailedImagesPerChapter) {
      // Drop the partial folder so a later rezip cannot package it as if it
      // were a complete chapter.
      await this.fsService.removeDir(chapterDir);
      throw new Error(
        `${result.failed.length}/${jobs.length} images failed ` +
          `(first: ${result.failed[0].reason})`,
      );
    }
    if (result.failed.length > 0) {
      const sample = result.failed[0];
      this.logger.warn(
        `Chapter '${safeTitle}': ${result.failed.length}/${jobs.length} images failed; ` +
          `first failure: ${sample.reason} (url=${sample.job.url})`,
      );
    } else {
      this.logger.log(
        `Chapter '${safeTitle}': downloaded ${result.succeeded.length}/${jobs.length} image(s), zipping...`,
      );
    }

    // Below the failure threshold the chapter is zipped as-is, like
    // modules/DGmanga.py:download_img after its retry pass.
    await this.archive.zipChapter(chapterDir);

    this.logger.log(`Chapter '${safeTitle}': done ✓`);

    if (updateLastEpi) {
      const current = this.library.get(manga.manga_id);
      // A never-downloaded manga starts at last_epi=1 (legacy schema), so
      // chapter 1 also advances it until the first download completes.
      const advances =
        chapter.index > current.last_epi ||
        (!current.completed && chapter.index === current.last_epi);
      if (advances) {
        await this.library.patch(manga.manga_id, {
          last_epi: chapter.index,
          last_epi_name: safeTitle,
          updated_at: this.nowSeconds(),
        });
      }
    }

    const current = toApiManga(this.library.get(manga.manga_id));
    this.events.emitChapterCompleted({
      manga_id: manga.manga_id,
      chapter_index: chapter.index,
      chapter_title: safeTitle,
      last_epi: current.last_epi,
      last_epi_name: current.last_epi_name,
      updated_at: current.updated_at,
    });
  }

  // -------------------------------------------- run lifecycle events

  private announceStart(mangaId: string, kind: DownloadTaskKind): void {
    this.events.emitDownloadStarted({ manga_id: mangaId, kind });
  }

  /** Ends a run that announceStart() opened, on every path. */
  private announceEnd(
    mangaId: string,
    kind: DownloadTaskKind,
    status: 'done' | 'failed',
    total: number,
    failed: number,
  ): void {
    let manga: ApiManga | null;
    try {
      manga = toApiManga(this.library.get(mangaId));
    } catch {
      manga = null; // removed meanwhile (DMCA)
    }
    this.events.emitDownloadCompleted({
      manga_id: mangaId,
      kind,
      status,
      chapters_total: total,
      chapters_failed: failed,
      manga,
    });
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  private chapterStartDelayMs(): number {
    return 2000 + Math.random() * 3000;
  }

  /** Fetch a chapter's image list, waiting out 429s. The legacy scraper
   *  slept and retried on a rate-limited chapter page; without this the
   *  chapter is dropped, and since last_epi only tracks the highest
   *  downloaded index, a dropped chapter is never picked up again. */
  private async scrapeChapterImages(
    sourceName: string,
    chapterUrl: string,
    label: string,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      const images = await this.scraper.getChapterImages(sourceName, chapterUrl);
      if (!images.errorCode) return images;

      if (
        images.errorCode !== 429 ||
        attempt >= this.maxChapterRateLimitRetries
      ) {
        throw new Error(
          `chapter scrape returned errorCode=${images.errorCode}`,
        );
      }

      const wait =
        this.chapterRateLimitBaseMs * (attempt + 1) + Math.random() * 10_000;
      this.logger.warn(
        `Chapter '${label}': page rate limited (429); retrying in ` +
          `${Math.round(wait / 1000)}s ` +
          `(${attempt + 1}/${this.maxChapterRateLimitRetries})`,
      );
      await this.sleep(wait);
    }
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
      manga_id: manga.manga_id,
      manga_name: manga.manga_name,
    });
  }

  /** Make an already-reformatted chapter title safe as a single path
   *  segment. The legacy app used the title verbatim, so on Linux (the
   *  deployment target) only the path separator is replaced, keeping names
   *  identical to existing downloads. Windows — development only — also
   *  rejects a handful of other characters.
   *
   *  A title that ends up empty, `.` or `..` would make the chapter folder
   *  the manga folder (or its parent), so a failed chapter's removeDir or
   *  the zip step would destroy every chapter: it falls back to
   *  `第<index>话`. Every other title is unchanged. */
  private sanitiseTitle(title: string, index: number): string {
    const hostile = process.platform === 'win32' ? /[\\/:*?"<>|]/g : /\//g;
    const safe = title.replace(hostile, '_').trim();
    if (safe === '' || safe === '.' || safe === '..') {
      this.logger.warn(
        `Chapter ${index}: unusable title ${JSON.stringify(title)}; using 第${index}话`,
      );
      return `第${index}话`;
    }
    return safe;
  }

  /** Overridable in tests so backoff waits don't take real time. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private padPage(n: number): string {
    return n.toString().padStart(3, '0');
  }
}
