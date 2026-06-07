import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AppConfig } from '../../config/configuration';

/**
 * Handles dynamic config.js only.
 *
 * SPA fallback is registered as Express middleware in main.ts
 * AFTER all routes and static file serving, so it doesn't
 * intercept /css, /js, /img, /fonts, /favicon.ico requests.
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
