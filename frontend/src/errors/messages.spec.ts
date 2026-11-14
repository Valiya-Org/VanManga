import { describe, it, expect } from 'vitest';
import { ApiError } from '@/api/errors';
import { API_ERROR_CODES, CLIENT_ERROR_CODES, DEFAULT_ERROR_CODES } from '@/api/types';
import { ERROR_MESSAGES, FALLBACK_MESSAGE, errorMessage } from './messages';

const hasChinese = (s: string) => /[一-鿿]/.test(s);

describe('errorMessage', () => {
  it.each([...API_ERROR_CODES, ...DEFAULT_ERROR_CODES, ...CLIENT_ERROR_CODES])(
    'has a dedicated Chinese message for %s',
    (code) => {
      const text = ERROR_MESSAGES[code];
      expect(text).toBeTruthy();
      expect(hasChinese(text)).toBe(true);
      expect(errorMessage(new ApiError(400, code))).toBe(text);
    },
  );

  it('never shows the server message text', () => {
    const err = new ApiError(502, 'kavita-unreachable', 'connect ECONNREFUSED 10.0.0.1:5000');
    expect(errorMessage(err)).toBe(ERROR_MESSAGES['kavita-unreachable']);
    expect(errorMessage(err)).not.toContain('ECONNREFUSED');
  });

  it('falls back by HTTP status class for an unknown code', () => {
    expect(errorMessage(new ApiError(418, 'http-418'))).toBe(ERROR_MESSAGES['bad-request']);
    expect(errorMessage(new ApiError(500, 'http-500'))).toBe(ERROR_MESSAGES['internal-error']);
  });

  it('reads an unknown 502/503/504 as a connectivity problem', () => {
    for (const s of [502, 503, 504]) {
      expect(errorMessage(new ApiError(s, `http-${s}`))).toBe(ERROR_MESSAGES['network-error']);
    }
  });

  it('gives no user message for a cancelled request', () => {
    expect(errorMessage(new ApiError(0, 'canceled'))).toBe('');
  });

  it('uses the generic fallback for anything else', () => {
    expect(errorMessage(new ApiError(0, 'weird'))).toBe(FALLBACK_MESSAGE);
    expect(errorMessage(new Error('boom'))).toBe(FALLBACK_MESSAGE);
    expect(errorMessage('nope')).toBe(FALLBACK_MESSAGE);
    expect(hasChinese(FALLBACK_MESSAGE)).toBe(true);
  });
});
