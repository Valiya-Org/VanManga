import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { FilesystemService } from '../filesystem/filesystem.service';

export interface ImageDownloadJob {
  url: string;
  filename: string;
  /** Per-source headers from IMangaSource.getChapterImages.requestHeaders. */
  extraHeaders?: Record<string, string>;
}

export interface ChapterDownloadResult {
  succeeded: ImageDownloadJob[];
  failed: { job: ImageDownloadJob; reason: string }[];
}

/** Replaces modules/DGmanga.py:download_img.
 *  Downloads a chapter's worth of images concurrently, handling 429
 *  with exponential backoff and propagating CF cookies/UA. The original
 *  used DrissionPage's SessionPage; we use plain axios since the URLs
 *  are direct image endpoints (no JS challenge). */
@Injectable()
export class ImageDownloaderService {
  private readonly logger = new Logger(ImageDownloaderService.name);
  private readonly maxRetriesPerImage = 3;
  /** Coordinates 429 backoff across concurrent image downloads in
   *  the same chapter — when one image hits 429, sibling downloads
   *  pause until the cooldown expires. Mirrors Error_dict[g_error_flag]
   *  in modules/DGmanga.py. */
  private cooldownUntil = 0;

  constructor(
    private readonly http: HttpService,
    private readonly fsService: FilesystemService,
    private readonly cloudflare: CloudflareService,
  ) {}

  async downloadChapter(
    chapterDir: string,
    jobs: ImageDownloadJob[],
    options: { concurrency?: number } = {},
  ): Promise<ChapterDownloadResult> {
    const concurrency = options.concurrency ?? 4;
    await this.fsService.ensureDir(chapterDir);

    const result: ChapterDownloadResult = { succeeded: [], failed: [] };
    let cursor = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < jobs.length) {
        const idx = cursor++;
        const job = jobs[idx];
        try {
          await this.downloadOne(chapterDir, job);
          result.succeeded.push(job);
        } catch (err) {
          result.failed.push({ job, reason: (err as Error).message });
        }
      }
    });

    await Promise.all(workers);
    return result;
  }

  private async downloadOne(
    chapterDir: string,
    job: ImageDownloadJob,
  ): Promise<void> {
    let attempt = 0;
    while (attempt <= this.maxRetriesPerImage) {
      await this.waitForCooldown();
      try {
        const response = await this.fetch(job);
        if (response.status === 429) {
          this.scheduleBackoff(attempt);
          attempt += 1;
          continue;
        }
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}`);
        }
        await this.fsService.writeImage(
          chapterDir,
          job.filename,
          Buffer.from(response.data as ArrayBuffer),
        );
        return;
      } catch (err) {
        const status = (err as AxiosError).response?.status;
        if (status === 429) {
          this.scheduleBackoff(attempt);
          attempt += 1;
          continue;
        }
        if (attempt >= this.maxRetriesPerImage) {
          throw err;
        }
        attempt += 1;
        await this.sleep(500 * attempt);
      }
    }
    throw new Error(`max retries exceeded for ${job.url}`);
  }

  private async fetch(job: ImageDownloadJob): Promise<AxiosResponse> {
    const cfHeaders = this.cloudflare.buildHeaders();
    const headers = { ...cfHeaders, ...(job.extraHeaders ?? {}) };
    return firstValueFrom(
      this.http.get(job.url, {
        headers,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        timeout: 30_000,
      }),
    );
  }

  private scheduleBackoff(attempt: number): void {
    const wait = (5 + attempt * 5 + Math.random() * 5) * 1000;
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + wait);
    this.logger.warn(
      `429 hit; cooldown for ${Math.round(wait / 1000)}s (shared across siblings)`,
    );
  }

  private async waitForCooldown(): Promise<void> {
    while (Date.now() < this.cooldownUntil) {
      await this.sleep(this.cooldownUntil - Date.now());
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }
}
