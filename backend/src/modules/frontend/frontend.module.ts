import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { FrontendController } from './frontend.controller';

// __dirname at runtime = backend/dist/modules/frontend → up 4 = repo root.
// Vite outputs the SPA to <root>/frontend/dist (index.html + assets/).
const STATIC_ROOT = resolve(
  __dirname, '..', '..', '..', '..', 'frontend', 'dist',
);

/**
 * The Vue3 SPA frontend from `frontend/dist/` (Vite build output).
 *
 * Directory layout:
 *   STATIC_ROOT = frontend/dist/         → index.html at the dist root
 *   assets      = frontend/dist/assets/  → hashed js/css/img bundles
 *
 * Serving is plain Express middleware registered by configureApp
 * (app.setup.ts): `spaFallback` answers GET/HEAD / and client-side routes
 * with index.html, `useStaticAssets` serves the files, and anything else
 * reaches Nest's 404. FrontendController serves GET /api/config.
 *
 * (Not @nestjs/serve-static: its Express loader adds a catch-all GET that
 * answers missing assets with index.html, and an error middleware that
 * turns every error on an excluded path — /api — into a 404, including
 * body-parser's 400 and 413.)
 */
@Module({
  imports: [ConfigModule],
  controllers: [FrontendController],
})
export class FrontendModule {}

export { STATIC_ROOT };
