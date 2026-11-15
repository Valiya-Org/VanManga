import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CorsIoAdapter } from './common/security/cors-io.adapter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { spaFallback } from './modules/frontend/spa-fallback';

/** Everything main.ts applies to the app before listening, shared with the
 *  e2e suites so they exercise the production pipeline.
 *
 *  The app must be created with `bodyParser: false`: the built-in 100kb
 *  parser is replaced with the 25 MB limit docs/api-contract.md §1.3
 *  promises. */
export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '25mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '25mb' });

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

  // SPA fallback — serve index.html for client-side routes only. Gated to
  // extension-less GET paths so hashed assets are not shadowed. Registered before init so it sits ahead of Nest's 404 handler.
  app.use(spaFallback);
}
