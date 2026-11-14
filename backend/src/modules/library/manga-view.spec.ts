import type { Manga } from './entities/manga.entity';
import { thumbnailPath, toApiManga } from './manga-view';

function record(overrides: Partial<Manga> = {}): Manga {
  return {
    manga_id: '-LoL2tSY',
    manga_name: 'n',
    artist_name: 'a',
    newest_epi: 'e',
    thumbnail: 'http://old.example:5000/api/dogemanga/thumbnail?mid=-LoL2tSY',
    last_epi: 3,
    last_epi_name: '第3话',
    completed: true,
    serialization: 0,
    download_switch: 0,
    add_date: 1700000000.25,
    ...overrides,
  };
}

describe('toApiManga', () => {
  it.each([
    'http://old.example:5000/api/dogemanga/thumbnail?mid=-LoL2tSY',
    'https://host/api/library/-LoL2tSY/thumbnail',
    '/api/library/-LoL2tSY/thumbnail',
    '',
  ])('normalises thumbnail %p to the relative library path', (thumbnail) => {
    expect(toApiManga(record({ thumbnail })).thumbnail).toBe(
      '/api/library/-LoL2tSY/thumbnail',
    );
  });

  it('URL-encodes the id in the thumbnail path', () => {
    expect(thumbnailPath('a/b c')).toBe('/api/library/a%2Fb%20c/thumbnail');
  });

  it('defaults updated_at to add_date for old records', () => {
    expect(toApiManga(record()).updated_at).toBe(1700000000.25);
  });

  it('keeps a written updated_at', () => {
    expect(toApiManga(record({ updated_at: 1800000000 })).updated_at).toBe(1800000000);
  });

  it('defaults source to dgmanga and maps the kavita "None" sentinel to null', () => {
    const view = toApiManga(record());
    expect(view.source).toBe('dgmanga');
    expect(view.kavita_url).toBeNull();
    expect(toApiManga(record({ kavita_url: 'None' })).kavita_url).toBeNull();
    expect(toApiManga(record({ kavita_url: 'http://k/library/1/series/2' })).kavita_url).toBe(
      'http://k/library/1/series/2',
    );
  });

  it('coerces manga_id to a string and leaves add_date untouched', () => {
    const view = toApiManga(record({ manga_id: 123 as unknown as string }));
    expect(view.manga_id).toBe('123');
    expect(view.add_date).toBe(1700000000.25);
  });

  it('does not mutate the stored record', () => {
    const r = record();
    toApiManga(r);
    expect(r.thumbnail).toContain('dogemanga');
    expect(r.updated_at).toBeUndefined();
  });
});
