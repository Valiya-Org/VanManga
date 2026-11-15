import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export const ADMIN_TOKEN_HEADER = 'X-Admin-Token';

/** OpenAPI document served at /api/docs. Built from the controllers'
 *  decorators; docs/api-contract.md is the prose version of the same API. */
export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('VanManga API')
    .setDescription(
      'Canonical routes (/api/library, /api/download, /api/scraper, /api/kavita, ' +
        '/api/config) answer { code, data } on success and { code, error, message?, data? } ' +
        'on failure, with code equal to the HTTP status. See docs/api-contract.md.',
    )
    .setVersion('0.2.0')
    .addTag('config', 'Runtime configuration for the SPA')
    .addTag('library', 'Manga library')
    .addTag('download', 'Download queue')
    .addTag('scraper', 'Manga source scraping')
    .addTag('kavita', 'Kavita reader integration')
    .addApiKey({ type: 'apiKey', in: 'header', name: ADMIN_TOKEN_HEADER }, 'admin-token')
    .build();
  return SwaggerModule.createDocument(app, config);
}
