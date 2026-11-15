import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CorsIoAdapter } from './common/security/cors-io.adapter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { STATIC_ROOT } from './modules/frontend/frontend.module';
import { spaFallback } from './modules/frontend/spa-fallback';

/** Everything main.ts applies to the app before listening, shared with the
 *  e2e suites so they exercise the production pipeline.
 *
 *  The app must be created with `bodyParser: false`: the built-in 100kb
 *  parser is replaced with the 1 MB limit docs/api-contract.md §1.3
 *  promises. The largest body is a re-download chapter list, which at
 *  ~150 bytes per chapter can outgrow 100kb on a long series. */
export const BODY_LIMIT = '1mb';

export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: BODY_LIMIT });

  // Same-origin by default: no CORS headers, so a foreign web page cannot
  // send JSON POSTs / DELETEs or read responses. CORS_ORIGINS opts in.
  const corsOrigins =
    app.get(ConfigService, { strict: false }).get<string[]>('security.corsOrigins') ?? [];
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins, credentials: true });
    app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins));
  }

  app.setGlobalPrefix('api');

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // The SPA (frontend/dist), both registered before init so they sit ahead
  // of Nest's 404 handler. spaFallback answers client-side routes (extension-
  // less GET/HEAD paths) with index.html; useStaticAssets serves real files
  // and falls through on a miss, so a missing asset or the removed
  // /js/config.js is Nest's 404 JSON, not index.html.
  app.use(spaFallback);
  app.useStaticAssets(STATIC_ROOT, { index: false, fallthrough: true });
}
