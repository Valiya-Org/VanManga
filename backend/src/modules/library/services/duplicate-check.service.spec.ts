import { DuplicateCheckService } from './duplicate-check.service';
import type { Manga } from '../entities/manga.entity';

function makeManga(name: string): Manga {
  return {
    manga_id: name.toLowerCase().replace(/\s/g, '-'),
    manga_name: name,
    artist_name: 'test',
    newest_epi: '1',
    thumbnail: '',
    last_epi: 1,
    last_epi_name: '',
    completed: false,
    serialization: 0,
    download_switch: 0,
    add_date: Date.now(),
  };
}

describe('DuplicateCheckService', () => {
  let service: DuplicateCheckService;

  beforeEach(() => {
    service = new DuplicateCheckService();
  });

  it('should return exact match', () => {
    const lib = [makeManga('One Piece'), makeManga('Naruto')];
    const result = service.findCloseMatches('One Piece', lib);
    expect(result).toContain('One Piece');
  });

  it('should return close match (case insensitive)', () => {
    const lib = [makeManga('One Piece'), makeManga('Naruto')];
    const result = service.findCloseMatches('one piece', lib);
    expect(result).toContain('One Piece');
  });

  it('should return empty for completely different name', () => {
    const lib = [makeManga('Dragon Ball'), makeManga('Bleach')];
    const result = service.findCloseMatches('xxxxxxxxyz', lib);
    expect(result).toHaveLength(0);
  });

  it('should detect similar titles', () => {
    const lib = [
      makeManga('進撃の巨人'),
      makeManga('進撃の巨人 外伝'),
      makeManga('鬼滅の刃'),
    ];
    const result = service.findCloseMatches('進撃の巨人', lib);
    expect(result).toContain('進撃の巨人');
    expect(result).toContain('進撃の巨人 外伝');
    expect(result).not.toContain('鬼滅の刃');
  });

  it('should respect maxResults', () => {
    const lib = Array.from({ length: 20 }, (_, i) =>
      makeManga(`Test Series ${i}`),
    );
    const result = service.findCloseMatches('Test Series', lib, {
      maxResults: 3,
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should respect cutoff', () => {
    const lib = [makeManga('ABCDEF'), makeManga('ABCXYZ')];
    // High cutoff should filter more
    const strict = service.findCloseMatches('ABCDEF', lib, { cutoff: 0.9 });
    const loose = service.findCloseMatches('ABCDEF', lib, { cutoff: 0.3 });
    expect(strict.length).toBeLessThanOrEqual(loose.length);
  });

  it('should handle empty library', () => {
    const result = service.findCloseMatches('anything', []);
    expect(result).toHaveLength(0);
  });

  it('should handle single character name', () => {
    const lib = [makeManga('X')];
    const result = service.findCloseMatches('X', lib);
    expect(result).toContain('X');
  });
});
