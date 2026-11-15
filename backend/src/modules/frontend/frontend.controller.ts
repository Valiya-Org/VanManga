import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
 * extension-less GET paths, so it does not shadow hashed static assets.
 */
@ApiTags('config')
@Controller()
export class FrontendController {
  private readonly runtime: RuntimeConfig;

  constructor(config: ConfigService<AppConfig, true>) {
    const kavitaEnabled = config.get('kavita.enabled', { infer: true });
    this.runtime = {
      kavitaEnabled,
      kavitaExposeUrl: kavitaEnabled ? config.get('kavita.exposeUrl', { infer: true }) : null,
      adminRequired: config.get('security.adminToken', { infer: true }) !== '',
    };
  }

  /** GET /api/config — what the SPA needs to know about this server. */
  @Get('config')
  @ApiOperation({ summary: '{ kavitaEnabled, kavitaExposeUrl, adminRequired }' })
  getConfig() {
    return ok(this.runtime);
  }
}
