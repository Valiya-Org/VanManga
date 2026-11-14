import type { ExecutionContext } from '@nestjs/common';
import { ApiException } from '../http/api-exception';
import { AdminTokenGuard, tokensMatch } from './admin-token.guard';

function guard(adminToken: string) {
  return new AdminTokenGuard({ get: jest.fn(() => adminToken) } as never);
}

function ctx(headers: Record<string, string | string[]>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function failure(fn: () => unknown): ApiException {
  try {
    fn();
  } catch (err) {
    return err as ApiException;
  }
  throw new Error('expected a throw');
}

describe('AdminTokenGuard', () => {
  it('lets everything through when ADMIN_TOKEN is not set', () => {
    expect(guard('').canActivate(ctx({}))).toBe(true);
    expect(guard('').canActivate(ctx({ 'x-admin-token': 'whatever' }))).toBe(true);
  });

  it('accepts the matching X-Admin-Token header', () => {
    expect(guard('s3cret').canActivate(ctx({ 'x-admin-token': 's3cret' }))).toBe(true);
  });

  it('401 admin-token-required without the header', () => {
    const err = failure(() => guard('s3cret').canActivate(ctx({})));
    expect(err).toBeInstanceOf(ApiException);
    expect(err.getStatus()).toBe(401);
    expect(err.errorCode).toBe('admin-token-required');
  });

  it.each(['wrong', 's3cre', 's3cret ', 'S3CRET', ''])(
    '401 admin-token-invalid for %p',
    (token) => {
      const err = failure(() => guard('s3cret').canActivate(ctx({ 'x-admin-token': token })));
      expect(err.getStatus()).toBe(401);
      expect(err.errorCode).toBe(token === '' ? 'admin-token-required' : 'admin-token-invalid');
    },
  );

  it('rejects a repeated header', () => {
    const err = failure(() =>
      guard('s3cret').canActivate(ctx({ 'x-admin-token': ['s3cret', 's3cret'] })),
    );
    expect(err.errorCode).toBe('admin-token-invalid');
  });
});

describe('tokensMatch', () => {
  it('compares in constant time over digests, so lengths may differ', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
    expect(tokensMatch('', 'a')).toBe(false);
  });
});
