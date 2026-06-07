import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { FrontendController } from './frontend.controller';

const STATIC_ROOT = resolve(
  __dirname, '..', '..', '..', '..', 'frontend_static', 'static',
);

/**
 * Serves the Vue SPA frontend from `frontend_static/static/`.
 *
 * Directory layout (from Flask's perspective):
 *   static_folder  = frontend_static/static/       → css/, js/, img/, fonts/, favicon.ico
 *   template_folder = frontend_static/static/templates/ → index.html
 *
 * ServeStaticModule handles the static assets (css, js, etc.).
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
      // in FrontendController to point at templates/index.html
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
