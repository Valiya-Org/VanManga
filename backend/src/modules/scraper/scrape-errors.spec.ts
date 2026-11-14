import { NotFoundException } from '@nestjs/common';
import { ApiException } from '../../common/http/api-exception';
import { PythonRunnerError } from './python/python-runner.types';
import { assertScrapeOk, callScraper, scrapeFailure } from './scrape-errors';

describe('scrape error mapping', () => {
  it.each([
    [501, 502, 'scraper-blocked'],
    [504, 451, 'dmca'],
    [429, 429, 'rate-limited'],
    [503, 502, 'scraper-failed'],
  ])('errorCode %p → HTTP %p %p', (code, status, error) => {
    const ex = scrapeFailure(code)!;
    expect(ex.getStatus()).toBe(status);
    expect(ex.errorCode).toBe(error);
  });

  it('no errorCode means success', () => {
    expect(scrapeFailure(undefined)).toBeNull();
    const result: { chapters: never[]; errorCode?: number } = { chapters: [] };
    expect(assertScrapeOk(result)).toBe(result);
  });

  it('assertScrapeOk throws the mapped failure', () => {
    expect(() => assertScrapeOk({ errorCode: 504 })).toThrow(ApiException);
  });

  it('callScraper turns runner errors into 502 scraper-failed', async () => {
    const err = await callScraper(() =>
      Promise.reject(new PythonRunnerError('timed out')),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).getStatus()).toBe(502);
    expect((err as ApiException).errorCode).toBe('scraper-failed');
  });

  it('callScraper lets HTTP exceptions through', async () => {
    const nf = new NotFoundException('x');
    await expect(callScraper(() => Promise.reject(nf))).rejects.toBe(nf);
  });
});
