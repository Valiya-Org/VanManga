import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../../config/configuration';
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
  /** Fallback browser User-Agent. dogemanga sits behind Cloudflare and
   *  rejects requests without a browser-like UA (the legacy DrissionPage
   *  SessionPage always sent one). When CF is inactive both buildHeaders()
   *  and the Python requestHeaders are empty, so axios would otherwise go
   *  out as `axios/x.y` and get a 403. A real CF UA (when active) overrides
   *  this. */
  private readonly defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  /** Coordinates 429 backoff across concurrent image downloads in
   *  the same chapter — when one image hits 429, sibling downloads
   *  pause until the cooldown expires. Mirrors Error_dict[g_error_flag]
   *  in modules/DGmanga.py. */
  private cooldownUntil = 0;

  /** Default concurrent image fetches per chapter (config-driven so a
   *  future settings UI can tune it). Callers may still override per call. */
  private readonly defaultConcurrency: number;
  /** Polite inter-image delay (ms); 0 disables. See AppConfig.download. */
  private readonly imageDelayMs: number;

  constructor(
    private readonly http: HttpService,
    private readonly fsService: FilesystemService,
    private readonly cloudflare: CloudflareService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.defaultConcurrency = config.get('download.imageConcurrency', {
      infer: true,
    });
    this.imageDelayMs = config.get('download.imageDelayMs', { infer: true });
  }

  async downloadChapter(
    chapterDir: string,
    jobs: ImageDownloadJob[],
    options: { concurrency?: number } = {},
  ): Promise<ChapterDownloadResult> {
    const concurrency = options.concurrency ?? this.defaultConcurrency;
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
        // Polite spacing between requests on this worker. Skip when no
        // work remains so we don't tack a trailing delay onto the chapter.
        if (cursor < jobs.length) {
          await this.politeDelay();
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
    const headers: Record<string, string> = {
      'User-Agent': this.defaultUserAgent,
      Referer: 'https://dogemanga.com/',
      ...cfHeaders,
      ...(job.extraHeaders ?? {}),
    };
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

  /** Polite delay between successive image fetches on the same worker.
   *  base + up to 1x random jitter, mirroring the legacy
   *  gevent.sleep(1 + rand). Disabled when imageDelayMs <= 0. */
  private async politeDelay(): Promise<void> {
    if (this.imageDelayMs <= 0) return;
    await this.sleep(this.imageDelayMs + Math.random() * this.imageDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }
}
