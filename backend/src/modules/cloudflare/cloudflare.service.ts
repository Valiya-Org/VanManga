import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../../config/configuration';
import type {
  CloudflareState,
  FlareSolverrResponse,
} from './cloudflare.types';

@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly maxRetries = 5;
  private readonly state: CloudflareState = {
    active: false,
    cfClearance: null,
    userAgent: null,
    updatedAt: null,
  };

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  isEnabled(): boolean {
    return this.config.get('flaresolverr.enabled', { infer: true });
  }

  getState(): Readonly<CloudflareState> {
    return { ...this.state };
  }

  /** Detection helper: matches the inline check in main.py:cfMonitor.
   *  Returns true if the response signals a CF challenge. */
  isCloudflareChallenged(status: number, body: string): boolean {
    return status === 403 || body.includes('__cf_chl_rt_tk');
  }

  /** Replaces utils/flaresolverr_bypasser.py:flaresolverr_bypasser.
   *  Resolves a Cloudflare challenge for the given URL and returns
   *  the updated state (also stored on the service singleton).
   */
  async solveChallenge(targetUrl: string): Promise<CloudflareState> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'FlareSolverr is not configured (FLARESOLVERR_URL is empty)',
      );
    }

    const flaresolverrUrl = this.config.get('flaresolverr.url', {
      infer: true,
    });
    this.state.active = true;

    const payload = {
      cmd: 'request.get',
      url: targetUrl,
      maxTimeout: 60_000,
      returnOnlyCookies: true,
    };

    let attempt = 0;
    let response: FlareSolverrResponse | null = null;

    while (attempt <= this.maxRetries) {
      try {
        const res = await firstValueFrom(
          this.http.post<FlareSolverrResponse>(flaresolverrUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 70_000,
          }),
        );
        response = res.data;
        if (response.status === 'ok') break;
      } catch (err) {
        this.logger.warn(
          `FlareSolverr attempt ${attempt + 1} failed: ${(err as Error).message}`,
        );
      }
      attempt += 1;
    }

    if (
      !response ||
      (response.status !== 'ok' && response.message !== 'Challenge solved!')
    ) {
      this.logger.error(
        'Failed to solve Cloudflare challenge after retries; check FlareSolverr connectivity',
      );
      throw new ServiceUnavailableException(
        'FlareSolverr could not solve the Cloudflare challenge',
      );
    }

    const solution = response.solution!;
    const clearance = solution.cookies.find((c) => c.name === 'cf_clearance');

    this.state.cfClearance = clearance?.value ?? null;
    this.state.userAgent = solution.userAgent;
    this.state.updatedAt = new Date();

    this.logger.log('Cloudflare challenge solved; CF state refreshed');
    return this.getState();
  }

  /** Build cookie + UA headers from the current state. Useful for the
   *  scraper to inject when CF is active. */
  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.state.userAgent) {
      headers['User-Agent'] = this.state.userAgent;
    }
    if (this.state.cfClearance) {
      headers['Cookie'] = `cf_clearance=${this.state.cfClearance}`;
    }
    return headers;
  }

  reset(): void {
    this.state.active = false;
    this.state.cfClearance = null;
    this.state.userAgent = null;
    this.state.updatedAt = null;
  }
}
