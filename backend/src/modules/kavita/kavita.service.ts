import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../../config/configuration';
import {
  DOWNLOAD_COMPLETED,
  type DownloadCompletedEvent,
} from '../../common/events/app.events';
import { LibraryRepository } from '../library/library.repository';

/**
 * Kavita integration — replaces utils/kavita_lib_pull.py and
 * utils/kavita_scan_folder.py.
 *
 * Listens to DOWNLOAD_COMPLETED events to trigger folder scans,
 * eliminating the circular dependency with DownloadModule.
 */
@Injectable()
export class KavitaService {
  private readonly logger = new Logger(KavitaService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly repo: LibraryRepository,
  ) {}

  // ------------------------------------------------ event listener

  /** React to download completion — trigger Kavita folder scan. */
  @OnEvent(DOWNLOAD_COMPLETED)
  async handleDownloadCompleted(event: DownloadCompletedEvent): Promise<void> {
    await this.scanFolder(event.mangaName, event.mangaId).catch((err) =>
      this.logger.warn(
        `Kavita scanFolder failed for ${event.mangaId}: ${(err as Error).message}`,
      ),
    );
  }

  // ---------------------------------------------------------------- helpers

  get enabled(): boolean {
    return this.config.get('kavita.enabled', { infer: true });
  }

  private get baseUrl(): string {
    return this.config.get('kavita.baseUrl', { infer: true });
  }

  private get exposeUrl(): string {
    return this.config.get('kavita.exposeUrl', { infer: true });
  }

  private get adminApiKey(): string {
    return this.config.get('kavita.adminApiKey', { infer: true });
  }

  private get libId(): number {
    return this.config.get('kavita.libId', { infer: true });
  }

  /** Authenticate via Plugin API and return JWT token. */
  private async authenticate(): Promise<string> {
    const url = `${this.baseUrl}/api/Plugin/authenticate?apiKey=${this.adminApiKey}&pluginName=nestjsScanScript`;
    const res = await firstValueFrom(
      this.http.post<{ token: string }>(url),
    );
    return res.data.token;
  }

  // ---------------------------------------------- kavita_lib_pull equivalent

  /** Pull all Kavita series and update kavita_url on matching manga.
   *  Replaces utils/kavita_lib_pull.py:kavita_lib_pull(). */
  async syncLibrary(): Promise<number> {
    if (!this.enabled) {
      this.logger.debug('Kavita not configured; skipping lib sync');
      return 0;
    }

    let jwt: string;
    try {
      jwt = await this.authenticate();
    } catch (err) {
      this.logger.error(
        `Kavita auth failed: ${(err as Error).message}`,
      );
      return 0;
    }

    let series: Array<{ id: number; folderPath: string }>;
    try {
      const res = await firstValueFrom(
        this.http.post<Array<{ id: number; folderPath: string }>>(
          `${this.baseUrl}/api/Series/all-v2`,
          {},
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      series = res.data;
    } catch (err) {
      this.logger.error(
        `Kavita series fetch failed: ${(err as Error).message}`,
      );
      return 0;
    }

    let updated = 0;
    for (const s of series) {
      if (!s.folderPath.includes('$')) continue;
      const mangaId = s.folderPath.split('$')[1];
      if (!this.repo.has(mangaId)) continue;

      const kavitaUrl = `${this.exposeUrl}/library/${this.libId}/series/${s.id}`;
      await this.repo.update(mangaId, { kavita_url: kavitaUrl });
      updated++;
    }

    this.logger.log(`Kavita lib sync: updated ${updated} entries`);
    return updated;
  }

  // ------------------------------------------- kavita_scan_folder equivalent

  /** Trigger Kavita to scan a specific manga folder.
   *  Called after download completes. Replaces utils/kavita_scan_folder.py. */
  async scanFolder(mangaName: string, mangaId: string): Promise<boolean> {
    if (!this.enabled) return false;

    let jwt: string;
    try {
      jwt = await this.authenticate();
    } catch (err) {
      this.logger.error(
        `Kavita auth failed for scanFolder: ${(err as Error).message}`,
      );
      return false;
    }

    try {
      const res = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/api/Library/scan-folder`,
          {
            apiKey: this.adminApiKey,
            folderPath: `/manga/${mangaName}$${mangaId}`,
          },
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      const ok = res.status === 200;
      if (ok) this.logger.log(`Kavita scan triggered for ${mangaId}`);
      return ok;
    } catch (err) {
      this.logger.error(
        `Kavita scanFolder failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  // ------------------------------------------------- Frontend proxy: login

  /** Proxy Kavita user login. Replaces KavitaLogin resource in main.py. */
  async login(
    username: string,
    password: string,
  ): Promise<{
    apiKey: string;
    jwt: string;
    refreshToken: string;
    loginUrl: string;
  }> {
    const res = await firstValueFrom(
      this.http.post<{
        apiKey: string;
        token: string;
        refreshToken: string;
      }>(
        `${this.baseUrl}/api/Account/login`,
        { username, password, apiKey: '' },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    return {
      apiKey: res.data.apiKey,
      jwt: res.data.token,
      refreshToken: res.data.refreshToken,
      loginUrl: `${this.exposeUrl}/login?apiKey=${res.data.apiKey}`,
    };
  }

  // ----------------------------------------- Frontend proxy: refresh token

  /** Proxy Kavita token refresh. Replaces KavitaRefreshToken in main.py. */
  async refreshToken(
    jwt: string,
    refreshToken: string,
  ): Promise<{ jwt: string; refreshToken: string }> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; refreshToken: string }>(
        `${this.exposeUrl}/api/Account/refresh-token`,
        { token: jwt, refreshToken },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    return {
      jwt: res.data.token,
      refreshToken: res.data.refreshToken,
    };
  }
}
