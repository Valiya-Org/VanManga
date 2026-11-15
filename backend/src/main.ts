import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from './bootstrap';
import { findRevokedRoots } from './common/security/trust-store-check';

async function bootstrap(): Promise<void> {
  // Outbound scraping / Kavita calls rely on Node's bundled CA store, which
  // browser revocation (CRLSet/OneCRL) does not reach. Refuse to start on a
  // Node build that still trusts a compromised root.
  const revoked = findRevokedRoots();
  if (revoked.length > 0) {
    throw new Error(
      `Node ${process.version} trusts revoked root(s): ${revoked.join(', ')}. ` +
        'Upgrade to Node 22.23.4 / 24.22.1 / 26.12.1 or later.',
    );
  }

  const app = await createApp({
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

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
