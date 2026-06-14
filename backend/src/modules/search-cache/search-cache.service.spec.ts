import { ConfigService } from '@nestjs/config';
import { SearchCacheService } from './search-cache.service';
import type { AppConfig } from '../../config/configuration';
import type { SearchResultDto } from '../scraper/dto';

function makeConfig(
  ttlMs: number,
  maxEntries: number,
): ConfigService<AppConfig, true> {
  return {
    get: (path: string) =>
      path === 'searchCache.ttlMs' ? ttlMs : maxEntries,
  } as unknown as ConfigService<AppConfig, true>;
}

function candidate(id: string, source = 'dgmanga'): SearchResultDto {
  return {
    manga_id: id,
    manga_name: `name-${id}`,
    artist_name: `artist-${id}`,
    newest_epi: '1',
    thumbnail: `base64-${id}`,
    source,
  };
}

describe('SearchCacheService', () => {
  it('stores and resolves a candidate by source + id', () => {
    const svc = new SearchCacheService(makeConfig(10_000, 100));
    svc.put(candidate('-LoL2tSY'));
    const got = svc.get('dgmanga', '-LoL2tSY');
    expect(got?.thumbnail).toBe('base64--LoL2tSY');
  });

  it('returns null for unknown keys', () => {
    const svc = new SearchCacheService(makeConfig(10_000, 100));
    expect(svc.get('dgmanga', 'nope')).toBeNull();
  });

  it('keys by source so the same id under two sources does not collide', () => {
    const svc = new SearchCacheService(makeConfig(10_000, 100));
    svc.put(candidate('x', 'dgmanga'));
    svc.put(candidate('x', 'other'));
    expect(svc.get('dgmanga', 'x')?.source).toBe('dgmanga');
    expect(svc.get('other', 'x')?.source).toBe('other');
  });

  it('expires entries after the TTL', () => {
    jest.useFakeTimers();
    try {
      const svc = new SearchCacheService(makeConfig(1_000, 100));
      svc.put(candidate('a'));
      expect(svc.get('dgmanga', 'a')).not.toBeNull();
      jest.advanceTimersByTime(1_001);
      expect(svc.get('dgmanga', 'a')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('evicts the oldest entries past maxEntries (FIFO)', () => {
    const svc = new SearchCacheService(makeConfig(10_000, 2));
    svc.put(candidate('1'));
    svc.put(candidate('2'));
    svc.put(candidate('3')); // pushes out '1'
    expect(svc.get('dgmanga', '1')).toBeNull();
    expect(svc.get('dgmanga', '2')).not.toBeNull();
    expect(svc.get('dgmanga', '3')).not.toBeNull();
  });

  it('putMany caches a whole result set', () => {
    const svc = new SearchCacheService(makeConfig(10_000, 100));
    svc.putMany([candidate('a'), candidate('b')]);
    expect(svc.get('dgmanga', 'a')).not.toBeNull();
    expect(svc.get('dgmanga', 'b')).not.toBeNull();
  });
});
