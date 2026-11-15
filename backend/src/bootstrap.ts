import { NestFactory } from '@nestjs/core';
import type { NestApplicationOptions } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { buildSwaggerDocument } from './swagger';

/** Build the application exactly as production runs it, short of
 *  `listen()`: `NestFactory.create` + `configureApp` + Swagger at
 *  /api/docs. main.ts, the backend e2e suites and the frontend Playwright
 *  backend (frontend/e2e/start-backend.cjs) all boot through here, so a
 *  difference between how tests and production assemble the app cannot
 *  hide a bug again. (`Test.createTestingModule` is not equivalent: it
 *  instantiates providers before an HTTP adapter exists, which, for
 *  example, made @nestjs/serve-static fall back to a no-op loader.)
 *
 *  Only main.ts's Node trust-store check and `listen()` stay outside.
 *  Callers that do not listen must `await app.init()`. */
export async function createApp(
  options: Omit<NestApplicationOptions, 'bodyParser'> = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...options,
    // configureApp registers its own body parser with a larger limit.
    bodyParser: false,
  });

  configureApp(app);

  // Swagger — available at /api/docs
  SwaggerModule.setup('api/docs', app, buildSwaggerDocument(app));

  return app;
}
