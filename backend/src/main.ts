import 'reflect-metadata';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { STATIC_ROOT } from './modules/frontend/frontend.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

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

  // SPA fallback — registered AFTER all NestJS routes and ServeStaticModule
  // so it only catches requests that weren't handled by API routes or static files.
  const indexPath = join(STATIC_ROOT, 'templates', 'index.html');
  app.use(
    (
      req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api/') &&
        !req.path.startsWith('/socket.io')
      ) {
        res.sendFile(indexPath, (err) => {
          if (err) next();
        });
      } else {
        next();
      }
    },
  );

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
