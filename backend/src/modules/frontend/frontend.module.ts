import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { FrontendController } from './frontend.controller';

// __dirname at runtime = backend/dist/modules/frontend → up 4 = repo root.
// Vite outputs the SPA to <root>/frontend/dist (index.html + assets/).
const STATIC_ROOT = resolve(
  __dirname, '..', '..', '..', '..', 'frontend', 'dist',
);

/**
 * Serves the Vue3 SPA frontend from `frontend/dist/` (Vite build output).
 *
 * Directory layout:
 *   rootPath = frontend/dist/         → index.html at the dist root
 *   assets   = frontend/dist/assets/  → hashed js/css/img bundles
 *
 * ServeStaticModule handles the static assets (assets/, favicon, etc.).
 * FrontendController handles:
 *   - GET /js/config.js   → dynamic env injection
 *   - GET /               → index.html
 *   - GET /*              → SPA fallback to index.html
 */
@Module({
  imports: [
    ConfigModule,
    ServeStaticModule.forRoot({
      rootPath: STATIC_ROOT,
      exclude: ['/api{/*path}'],
      // Don't serve index.html automatically — we handle SPA fallback
      // in FrontendController to point at frontend/dist/index.html
      serveStaticOptions: {
        index: false,
        fallthrough: true,
      },
    }),
  ],
  controllers: [FrontendController],
})
export class FrontendModule {}

export { STATIC_ROOT };
