import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { spaFallback } from './modules/frontend/spa-fallback';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    // Disable the built-in 100kb body parser so we can register our own with
    // a larger limit — add-manga payloads carry a base64 cover thumbnail that
    // routinely exceeds 100kb. Without this, oversized POSTs are rejected by
    // the parser and fall through to the serve-static /api 404 handler
    // ("Cannot POST /api/library").
    bodyParser: false,
  });

  app.useBodyParser('json', { limit: '25mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '25mb' });

  app.enableCors({ origin: true, credentials: true });

  app.setGlobalPrefix('api', {
    exclude: [
      '/',             // SPA root
      'js/config.js',  // dynamic config
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger — available at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('VanManga API')
    .setDescription(
      'Hybrid NestJS + Python manga scraper backend. ' +
      'Legacy routes (/api/dogemanga/*) are preserved for the Vue frontend; ' +
      'new routes (/api/library/*, /api/download/*, /api/scraper/*, /api/kavita/*) ' +
      'are the canonical API going forward.',
    )
    .setVersion('0.1.0')
    .addTag('library', 'Manga library CRUD')
    .addTag('download', 'Download queue & orchestration')
    .addTag('scraper', 'Manga source scraping')
    .addTag('kavita', 'Kavita reader integration')
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, doc);

  // SPA fallback — serve index.html for client-side routes only.
  // Gated (see spaFallback) to extension-less GET paths so backend routes
  // like /js/config.js and hashed static assets are not shadowed.
  app.use(spaFallback);

  const config = app.get(ConfigService);
  const port = config.get<number>('port', 5000);

  await app.listen(port);
  Logger.log(`VanManga (NestJS) listening on port ${port}`, 'Bootstrap');
  Logger.log(`Swagger docs at http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('Fatal bootstrap error', err);
  process.exit(1);
});
