import { isSafeMangaId, ScraperService } from './scraper.service';

const result = (manga_id: unknown) => ({
  manga_id,
  manga_name: 'n',
  artist_name: 'a',
  newest_epi: '',
  thumbnail: '',
  source: 'dgmanga',
});

describe('isSafeMangaId', () => {
  it.each(['E8uHNgs8', '-LoL2tSY', 'a_b-c', '-e2e1'])('accepts %p', (id) => {
    expect(isSafeMangaId(id)).toBe(true);
  });

  it.each(['', '.', '..', '../x', 'a/b', 'a\\b', 'a\0b', 'a\nb', 42, null])('rejects %p', (id) => {
    expect(isSafeMangaId(id)).toBe(false);
  });
});

describe('ScraperService.search', () => {
  it('drops results with an unsafe manga_id before caching and returning them', async () => {
    const source = { search: jest.fn(async () => [result('ok1'), result('../escape'), result('ok2')]) };
    const cache = { putMany: jest.fn() };
    const svc = new ScraperService({ get: () => source } as never, cache as never);

    const out = await svc.search('dgmanga', 'q');

    expect(out.map((r) => r.manga_id)).toEqual(['ok1', 'ok2']);
    expect(cache.putMany).toHaveBeenCalledWith(out);
  });
});
