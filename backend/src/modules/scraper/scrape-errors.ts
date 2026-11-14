import { HttpException } from '@nestjs/common';
import { ApiException } from '../../common/http/api-exception';

/** Map a scraper sentinel `errorCode` (see scraper/dto) to the canonical
 *  failure, or null when the result is usable. */
export function scrapeFailure(errorCode: number | null | undefined): ApiException | null {
  switch (errorCode) {
    case undefined:
    case null:
      return null;
    case 501:
      return new ApiException(502, 'scraper-blocked', {
        message: 'Source is behind a Cloudflare challenge',
      });
    case 504:
      return new ApiException(451, 'dmca', { message: 'Removed at the source (DMCA)' });
    case 429:
      return new ApiException(429, 'rate-limited', { message: 'Source rate limited the request' });
    default:
      return new ApiException(502, 'scraper-failed', {
        message: `Source returned status ${errorCode}`,
      });
  }
}

/** Run a scraper call for a canonical route. HTTP exceptions (e.g.
 *  unknown-source) pass through; anything else — the Python process
 *  failing, timing out or printing garbage — becomes 502 scraper-failed. */
export async function callScraper<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new ApiException(502, 'scraper-failed', { message: (err as Error).message });
  }
}

/** Throw the canonical failure for a sentinel-carrying result. */
export function assertScrapeOk<T extends { errorCode?: number | null }>(result: T): T {
  const failure = scrapeFailure(result.errorCode);
  if (failure) throw failure;
  return result;
}
