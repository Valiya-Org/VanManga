import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, Interval, SchedulerRegistry } from '@nestjs/schedule';
import type { AppConfig } from '../../config/configuration';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { DownloadService } from '../download/download.service';
import { EventsGateway } from '../events/events.gateway';
import { KavitaService } from '../kavita/kavita.service';
import { LibraryRepository } from '../library/library.repository';
import { ScraperService } from '../scraper/scraper.service';

/**
 * Replaces Flask-APScheduler jobs from main.py:
 *
 *  1. dogemangaTask()  — daily 01:30 scan of all manga for updates
 *  2. kavitaTask()     — every 6 h, sync Kavita URLs into library
 *  3. cfMonitor()      — dynamic 12-min interval when CF is active
 *
 * Also runs boot_scanning() once on startup (OnModuleInit).
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly CF_MONITOR_KEY = 'cf-monitor';
  private readonly CF_MONITOR_MS = 720_000; // 12 minutes

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly repo: LibraryRepository,
    private readonly scraper: ScraperService,
    private readonly downloadService: DownloadService,
    private readonly kavita: KavitaService,
    private readonly cloudflare: CloudflareService,
    private readonly events: EventsGateway,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // --------------------------------------------------- startup

  async onModuleInit(): Promise<void> {
    // Kavita initial sync (like kavitaTask() on boot in main.py)
    if (this.kavita.enabled) {
      this.logger.log('Running initial Kavita lib sync...');
      await this.kavita.syncLibrary();
    }

    // Boot scan in background — don't block module init
    setImmediate(() => void this.bootScan());
  }

  // --------------------------------------------------- Job 1: daily scan

  /** Cron: every day at 01:30. Replaces scheduler.add_job(id="Dogemanga task"). */
  @Cron('0 30 1 * * *', { name: 'daily-scan' })
  async handleDailyScan(): Promise<void> {
    this.logger.log('=== Start Daily Update Task ===');
    await this.bootScan();
    this.logger.log('=== Daily Update Task Over ===');
  }

  // --------------------------------------------------- Job 2: kavita sync

  /** Interval: every 6 hours. Replaces scheduler.add_job(id="Kavita_pull"). */
  @Interval('kavita-sync', 6 * 60 * 60 * 1000)
  async handleKavitaSync(): Promise<void> {
    this.logger.log('=== Start Kavita Lib Update Task ===');
    await this.kavita.syncLibrary();
    this.logger.log('=== Kavita Lib Update Task Over ===');
  }

  // --------------------------------------------------- CF monitor (dynamic)

  /** Check CF status and manage the dynamic monitor interval.
   *  Replaces cfMonitor() + the dynamic add/remove job in boot_scanning(). */
  private async cfProbe(): Promise<void> {
    if (!this.cloudflare.isEnabled()) {
      this.logger.debug('FlareSolverr not configured; CF monitor disabled');
      this.removeCfMonitor();
      return;
    }

    try {
      const targetUrl = 'https://dogemanga.com';
      const axios = (await import('axios')).default;
      const res = await axios.get(targetUrl, {
        timeout: 15_000,
        validateStatus: () => true,
        maxRedirects: 5,
      });

      if (this.cloudflare.isCloudflareChallenged(res.status, res.data)) {
        this.logger.log('CF challenge detected, solving...');
        await this.cloudflare.solveChallenge(targetUrl);
        this.ensureCfMonitor();
      } else {
        this.logger.log('CF protection inactive, resetting state');
        this.cloudflare.reset();
        this.removeCfMonitor();
      }
    } catch (err) {
      this.logger.warn(
        `CF probe failed: ${(err as Error).message}`,
      );
    }
  }

  private ensureCfMonitor(): void {
    if (this.schedulerRegistry.doesExist('interval', this.CF_MONITOR_KEY)) {
      return;
    }
    const interval = setInterval(
      () => void this.cfProbe(),
      this.CF_MONITOR_MS,
    );
    this.schedulerRegistry.addInterval(this.CF_MONITOR_KEY, interval);
    this.logger.log('CF monitor interval registered (12 min)');
  }

  private removeCfMonitor(): void {
    if (!this.schedulerRegistry.doesExist('interval', this.CF_MONITOR_KEY)) {
      return;
    }
    this.schedulerRegistry.deleteInterval(this.CF_MONITOR_KEY);
    this.logger.log('CF monitor interval removed');
  }

  // --------------------------------------------------- boot scan

  /** Replaces boot_scanning() from main.py:166-239.
   *
   *  Scans all manga in library:
   *   - Not completed → enqueue full download
   *   - Completed + ongoing (download_switch=0) → check source for new chapters
   *   - Completed + finished (download_switch=1) → skip
   */
  private async bootScan(): Promise<void> {
    this.logger.log('=== Boot scan started ===');

    // CF probe first (matches boot_scanning flow)
    await this.cfProbe();

    const allManga = this.repo.list();
    if (allManga.length === 0) {
      this.logger.log('Library is empty; skipping boot scan');
      return;
    }

    // Process in reverse order (matching Python: reversed(manga_library.values()))
    const reversed = [...allManga].reverse();

    for (const manga of reversed) {
      this.logger.debug(`Scanning: ${manga.manga_name}`);

      if (!manga.completed) {
        // Never finished initial download
        this.logger.log(
          `${manga.manga_name}/${manga.manga_id}: incomplete, queuing full download`,
        );
        this.downloadService.submitFullManga(manga.manga_id);
        continue;
      }

      if (manga.download_switch === 1) {
        // Manga completed + marked as finished series
        this.logger.debug(`${manga.manga_name}: completed series, skip`);
        continue;
      }

      // Ongoing series — check for new chapters
      try {
        const sourceName = manga.source ?? 'dgmanga';
        const meta = await this.scraper.getMetadata(sourceName, manga.manga_id);

        if (meta.errorCode === 501 || meta.errorCode === 504) {
          this.logger.warn(
            `${manga.manga_name}: source returned errorCode=${meta.errorCode}, skipping`,
          );
          continue;
        }

        const current = meta.chapterCount;
        const history = manga.last_epi;

        this.logger.debug(
          `${manga.manga_name}: history=${history}, current=${current}`,
        );

        if (history < current) {
          this.logger.log(
            `${manga.manga_name}: update available (${history} → ${current}), queuing`,
          );
          this.downloadService.submitFullManga(manga.manga_id);
        }
      } catch (err) {
        this.logger.error(
          `Failed to check ${manga.manga_name}: ${(err as Error).message}`,
        );
      }

      // Rate limit between scans (matches gevent.sleep(1))
      await this.sleep(1000);
    }

    this.logger.log('=== Boot scan completed ===');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
