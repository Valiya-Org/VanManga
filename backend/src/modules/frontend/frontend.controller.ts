import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ok } from '../../common/http/envelope';
import type { AppConfig } from '../../config/configuration';

export interface RuntimeConfig {
  kavitaEnabled: boolean;
  kavitaExposeUrl: string | null;
  adminRequired: boolean;
}

/**
 * Runtime configuration for the SPA.
 *
 * The SPA fallback lives in `spaFallback` (app.setup.ts) and is gated to
 * extension-less GET paths, so it does not shadow `/js/config.js` or hashed
 * static assets.
 */
@ApiTags('config')
@Controller()
export class FrontendController {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly runtime: RuntimeConfig;

  constructor(config: ConfigService<AppConfig, true>) {
    this.baseUrl = config.get('frontend.baseUrl', { infer: true });
    this.wsUrl = config.get('frontend.websocketUrl', { infer: true });
    const kavitaEnabled = config.get('kavita.enabled', { infer: true });
    this.runtime = {
      kavitaEnabled,
      kavitaExposeUrl: kavitaEnabled ? config.get('kavita.exposeUrl', { infer: true }) : null,
      adminRequired: config.get('security.adminToken', { infer: true }) !== '',
    };
  }

  /** GET /api/config — replaces /js/config.js for the new frontend. */
  @Get('config')
  @ApiOperation({ summary: '{ kavitaEnabled, kavitaExposeUrl, adminRequired }' })
  getConfig() {
    return ok(this.runtime);
  }

  /** Legacy dynamic config.js (replaced create_config_js.sh); removed in P4. */
  @Get('js/config.js')
  @ApiExcludeEndpoint()
  configJs(@Res() res: Response): void {
    const body = [
      `window.MANGA_BASE_URL = "${this.baseUrl}";`,
      `window.MANGA_BASE_WEBSOCKET_URL = "${this.wsUrl}";`,
    ].join('\n');

    res.type('application/javascript').send(body);
  }
}
