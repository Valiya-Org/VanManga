import { describe, it, expect } from 'vitest';
import type { AxiosError } from 'axios';
import { http, unwrapEnvelopeError } from './http';

describe('http instance', () => {
  it('uses /api as baseURL', () => {
    expect(http.defaults.baseURL).toBe('/api');
  });

  it('is an axios instance with get/post methods', () => {
    expect(typeof http.get).toBe('function');
    expect(typeof http.post).toBe('function');
  });
});

describe('unwrapEnvelopeError', () => {
  it('unwraps a thrown { code, data } envelope and resolves', async () => {
    const error = {
      response: {
        status: 409,
        data: { statusCode: 409, message: { code: 434, data: false } },
      },
    } as unknown as AxiosError;

    const res = await unwrapEnvelopeError(error);

    expect(res.data).toEqual({ code: 434, data: false });
  });

  it('re-rejects a non-envelope error (string message)', async () => {
    const error = {
      response: {
        status: 404,
        data: { statusCode: 404, message: 'manga_id missing' },
      },
    } as unknown as AxiosError;

    await expect(unwrapEnvelopeError(error)).rejects.toBe(error);
  });

  it('re-rejects a network error with no response', async () => {
    const error = { message: 'Network Error' } as AxiosError;

    await expect(unwrapEnvelopeError(error)).rejects.toBe(error);
  });
});
