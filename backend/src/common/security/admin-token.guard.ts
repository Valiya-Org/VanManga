import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';
import { ApiException } from '../http/api-exception';

/** Constant-time comparison. Hashing first gives equal-length inputs, so
 *  neither the content nor the length of the secret leaks through timing. */
export function tokensMatch(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Protects destructive routes with the X-Admin-Token header when
 *  ADMIN_TOKEN is set; a no-op otherwise (docs/api-contract.md §1.4). */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('security.adminToken', { infer: true });
    if (!expected) return true;

    const header = context.switchToHttp().getRequest<Request>().headers['x-admin-token'];
    if (header === undefined || header === '') {
      throw new ApiException(401, 'admin-token-required', {
        message: 'This server requires the X-Admin-Token header',
      });
    }
    if (typeof header !== 'string' || !tokensMatch(header, expected)) {
      throw new ApiException(401, 'admin-token-invalid');
    }
    return true;
  }
}
