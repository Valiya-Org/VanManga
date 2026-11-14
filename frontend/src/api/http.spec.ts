import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { ApiError, isApiError, isCanceled } from './errors';
import { http, request, setAdminTokenProvider, toApiError } from './http';
import { ERROR_MESSAGES, errorMessage } from '@/errors/messages';
import * as api from './endpoints';
import { fakeServer, type FakeServer } from '@/test/fake-server';

let server: FakeServer;

beforeEach(() => {
  server = fakeServer(http);
});

afterEach(() => {
  server.restore();
  setAdminTokenProvider(null);
});

describe('http instance', () => {
  it('targets the same-origin /api prefix', () => {
    expect(http.defaults.baseURL).toBe('/api');
  });
});

describe('request()', () => {
  it('unwraps the success envelope to its data', async () => {
    server.reply(200, { code: 200, data: { hello: 'world' } });
    await expect(request<{ hello: string }>({ url: 'x' })).resolves.toEqual({
      hello: 'world',
    });
  });

  it('resolves falsy data such as null and false as-is', async () => {
    server.reply(200, { code: 200, data: null });
    await expect(request({ url: 'x' })).resolves.toBeNull();
    server.reply(200, { code: 200, data: false });
    await expect(request({ url: 'x' })).resolves.toBe(false);
  });

  it('converts a failure envelope into an ApiError', async () => {
    server.reply(409, {
      code: 409,
      error: 'duplicate',
      message: 'Similar manga already in the library',
      data: { duplicates: ['A'] },
    });

    const err = await request({ url: 'x' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(isApiError(err)).toBe(true);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(409);
    expect(apiErr.error).toBe('duplicate');
    expect(apiErr.message).toBe('Similar manga already in the library');
    expect(apiErr.data).toEqual({ duplicates: ['A'] });
  });

  it.each([
    [400, 'validation-failed'],
    [401, 'admin-token-required'],
    [403, 'kavita-login-failed'],
    [404, 'manga-not-found'],
    [410, 'search-expired'],
    [451, 'dmca'],
    [500, 'internal-error'],
    [502, 'scraper-blocked'],
  ])('keeps status %i and error %s from the envelope', async (status, error) => {
    server.reply(status, { code: status, error });
    await expect(request({ url: 'x' })).rejects.toMatchObject({ status, error });
  });

  it('keeps an unknown error string verbatim', async () => {
    server.reply(418, { code: 418, error: 'http-418' });
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 418,
      error: 'http-418',
    });
  });

  it('maps a non-envelope error body to http-<status>', async () => {
    server.reply(500, '<html>Oops</html>');
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 500,
      error: 'http-500',
    });
  });

  it.each([502, 503, 504])(
    'maps a non-envelope %i (proxy, no backend) to network-error keeping the status',
    async (status) => {
      server.reply(status, '<html>Bad Gateway</html>');
      const err = await request({ url: 'x' }).catch((e: unknown) => e);
      expect(err).toMatchObject({ status, error: 'network-error' });
      expect(errorMessage(err)).toBe(ERROR_MESSAGES['network-error']);
    },
  );

  it('maps a cancelled request to a distinct, non-user-facing canceled error', async () => {
    const controller = new AbortController();
    const held = server.replyDeferred();
    const p = request({ url: 'x', signal: controller.signal }).catch((e: unknown) => e);
    await held.received;
    controller.abort();
    const err = await p;
    expect(err).toMatchObject({ status: 0, error: 'canceled' });
    expect(isCanceled(err)).toBe(true);
    expect((err as ApiError).isCanceled).toBe(true);
    expect(errorMessage(err)).toBe('');
  });

  it('a request aborted before it is sent is canceled too', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(request({ url: 'x', signal: controller.signal })).rejects.toMatchObject({
      error: 'canceled',
    });
  });

  it('isCanceled is false for other errors and non-errors', () => {
    expect(isCanceled(new ApiError(0, 'network-error'))).toBe(false);
    expect(isCanceled(new Error('x'))).toBe(false);
    expect(isCanceled(undefined)).toBe(false);
  });

  it('has a request timeout, and a timeout reads as network-error', () => {
    expect(http.defaults.timeout).toBeGreaterThan(0);
    const timeout = new AxiosError('timeout of 1ms exceeded', AxiosError.ECONNABORTED);
    expect(toApiError(timeout)).toMatchObject({ status: 0, error: 'network-error' });
  });

  it('maps a 2xx body that is not an envelope to invalid-response', async () => {
    server.reply(200, '<html>index</html>');
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 200,
      error: 'invalid-response',
    });
  });

  it('maps a missing response to network-error with status 0', async () => {
    server.networkError();
    await expect(request({ url: 'x' })).rejects.toMatchObject({
      status: 0,
      error: 'network-error',
    });
  });
});

describe('admin token header', () => {
  function sentHeader(): string | undefined {
    const headers = AxiosHeaders.from(server.lastRequest()!.headers);
    return headers.get('X-Admin-Token') as string | undefined;
  }

  it('is omitted when no provider is set', async () => {
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x' });
    expect(sentHeader()).toBeUndefined();
  });

  it('is omitted when the provider has no token', async () => {
    setAdminTokenProvider(() => null);
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x' });
    expect(sentHeader()).toBeUndefined();
  });

  it('is not attached to ordinary requests even when a token is held', async () => {
    setAdminTokenProvider(() => 'secret');
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x' });
    expect(sentHeader()).toBeUndefined();
  });

  it('carries the current token on admin-protected requests', async () => {
    let token = 'first';
    setAdminTokenProvider(() => token);
    server.reply(200, { code: 200, data: true });
    await request({ url: 'x', adminProtected: true });
    expect(sentHeader()).toBe('first');

    token = 'second';
    await request({ url: 'x', adminProtected: true });
    expect(sentHeader()).toBe('second');
  });

  it('reads the token when the request is issued, not later', async () => {
    let token = 'at-call';
    setAdminTokenProvider(() => token);
    server.reply(200, { code: 200, data: true });
    const p = request({ url: 'x', adminProtected: true });
    token = 'changed';
    await p;
    expect(sentHeader()).toBe('at-call');
  });

  it('only delete and rezip are admin-protected', async () => {
    setAdminTokenProvider(() => 'secret');
    server.reply(200, { code: 200, data: true });
    await api.deleteManga('m');
    expect(sentHeader()).toBe('secret');
    await api.rezipLibrary();
    expect(sentHeader()).toBe('secret');
    for (const call of [
      () => api.getLibrary(),
      () => api.getConfig(),
      () => api.toggleAutoUpdate('m'),
      () => api.queueDownload('m'),
      () => api.kavitaLogin('u', 'p'),
    ]) {
      await call().catch(() => undefined);
      expect(sentHeader()).toBeUndefined();
    }
  });
});

describe('credentials', () => {
  it('does not send cross-site credentials (same-origin app)', () => {
    expect(http.defaults.withCredentials).toBeFalsy();
  });
});
