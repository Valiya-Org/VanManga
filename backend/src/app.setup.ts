import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { spaFallback } from './modules/frontend/spa-fallback';

/** Everything main.ts applies to the app before listening, shared with the
 *  e2e suites so they exercise the production pipeline.
 *
 *  The app must be created with `bodyParser: false`: the built-in 100kb
 *  parser is replaced with a larger limit because legacy add payloads carry
 *  a base64 cover thumbnail. */
export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '25mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '25mb' });

  app.enableCors({ origin: true, credentials: true });

  app.setGlobalPrefix('api', {
    exclude: [
      '/', // SPA root
      'js/config.js', // legacy dynamic config
    ],
  });

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // SPA fallback — serve index.html for client-side routes only. Gated to
  // extension-less GET paths so /js/config.js and hashed assets are not
  // shadowed. Registered before init so it sits ahead of Nest's 404 handler.
  app.use(spaFallback);
}
