import { mangaDirName, mangaFolderName } from './manga-path';

describe('manga-path', () => {
  it('replaces every slash in a manga name with a dash, like the legacy scraper', () => {
    expect(mangaDirName('Fate / Strange Fake')).toBe('Fate - Strange Fake');
    expect(mangaDirName('a/b/c')).toBe('a-b-c');
  });

  it('leaves names without a slash untouched', () => {
    expect(mangaDirName('A・S・Gグループフタコマ漫画劇場')).toBe(
      'A・S・Gグループフタコマ漫画劇場',
    );
  });

  it('builds the top-level folder as <name>$<id>', () => {
    expect(mangaFolderName('a/b', 'E8uHNgs8')).toBe('a-b$E8uHNgs8');
  });
});
