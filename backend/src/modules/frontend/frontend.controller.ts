import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AppConfig } from '../../config/configuration';

/**
 * Serves the dynamic `/js/config.js` only.
 *
 * The SPA fallback lives in `spaFallback` (main.ts) and is gated to
 * extension-less GET paths, so it does not shadow this route or hashed
 * static assets — those fall through to be handled here / by serve-static.
 */
@Controller()
export class FrontendController {
  private readonly baseUrl: string;
  private readonly wsUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.baseUrl = config.get('frontend.baseUrl', { infer: true });
    this.wsUrl = config.get('frontend.websocketUrl', { infer: true });
  }

  /** Dynamic config.js — replaces create_config_js.sh. */
  @Get('js/config.js')
  configJs(@Res() res: Response): void {
    const body = [
      `window.MANGA_BASE_URL = "${this.baseUrl}";`,
      `window.MANGA_BASE_WEBSOCKET_URL = "${this.wsUrl}";`,
    ].join('\n');

    res.type('application/javascript').send(body);
  }
}
