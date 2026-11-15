import { NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { SearchCacheService } from '../search-cache/search-cache.service';
import type { SearchResultDto } from '../scraper/dto';
import type { Manga } from './entities/manga.entity';
import { LibraryService } from './library.service';
import { DuplicateCheckService } from './services/duplicate-check.service';
import { MangaFactoryService } from './services/manga-factory.service';

const DOWNLOAD_ROOT = '/downloaded';

const config = {
  get: jest.fn((key: string) =>
    ({
      'storage.downloadRoot': DOWNLOAD_ROOT,
      'searchCache.ttlMs': 60_000,
      'searchCache.maxEntries': 100,
    })[key],
  ),
};

function candidate(overrides: Partial<SearchResultDto> = {}): SearchResultDto {
  return {
    manga_id: 'E8uHNgs8',
    manga_name: 'A・S・Gグループフタコマ漫画劇場',
    artist_name: 'みそのう',
    newest_epi: '第1话',
    thumbnail: 'QkFTRTY0',
    source: 'dgmanga',
    ...overrides,
  };
}

function setup(existing: Manga[] = []) {
  const store = new Map(existing.map((m) => [m.manga_id, { ...m }]));
  const repo = {
    list: jest.fn(() => [...store.values()]),
    get: jest.fn((id: string) => store.get(id)),
    has: jest.fn((id: string) => store.has(id)),
    add: jest.fn(async (m: Manga) => void store.set(m.manga_id, m)),
    update: jest.fn(async (id: string, patch: Partial<Manga>) => {
      const cur = store.get(id);
      if (!cur) return undefined;
      const next = { ...cur, ...patch };
      store.set(id, next);
      return next;
    }),
    remove: jest.fn(async (id: string) => void store.delete(id)),
  };
  const thumbnails = {
    persistAndLink: jest.fn(async <T extends { manga_id: string }>(m: T) => ({
      ...m,
      thumbnail: `http://host/api/library/${m.manga_id}/thumbnail`,
    })),
  };
  const fsService = {
    exists: jest.fn(async () => true),
    removeDir: jest.fn(async () => undefined),
  };
  const searchCache = new SearchCacheService(config as never);

  const svc = new LibraryService(
    repo as never,
    new MangaFactoryService(),
    new DuplicateCheckService(),
    thumbnails as never,
    fsService as never,
    searchCache,
    config as never,
  );
  return { svc, repo, store, thumbnails, fsService, searchCache };
}

function stored(overrides: Partial<Manga> = {}): Manga {
  return {
    ...new MangaFactoryService().build(candidate() as never),
    thumbnail: 'http://host/api/library/E8uHNgs8/thumbnail',
    ...overrides,
  };
}

describe('LibraryService.addManga', () => {
  it('resolves the candidate from the search cache and persists it', async () => {
    const t = setup();
    t.searchCache.putMany([candidate()]);

    const out = await t.svc.addManga({
      manga_id: 'E8uHNgs8',
      source: 'dgmanga',
      submit_sign: '0',
    });

    expect(out.status).toBe('added');
    // base64 cover comes from the cache, not the request
    expect(t.thumbnails.persistAndLink).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnail: 'QkFTRTY0' }),
    );
    expect(t.store.get('E8uHNgs8')).toMatchObject({
      manga_name: 'A・S・Gグループフタコマ漫画劇場',
      artist_name: 'みそのう',
      newest_epi: '第1话',
      source: 'dgmanga',
      thumbnail: 'http://host/api/library/E8uHNgs8/thumbnail',
      last_epi: 1,
      last_epi_name: '',
      completed: false,
      download_switch: 0,
    });
  });

  it('returns expired and writes nothing when the candidate is not cached', async () => {
    const t = setup();
    const out = await t.svc.addManga({ manga_id: 'E8uHNgs8', source: 'dgmanga', submit_sign: '0' });
    expect(out.status).toBe('expired');
    expect(t.repo.add).not.toHaveBeenCalled();
    expect(t.thumbnails.persistAndLink).not.toHaveBeenCalled();
  });

  it('the cache is keyed by source', async () => {
    const t = setup();
    t.searchCache.putMany([candidate({ source: 'dgmanga' })]);
    const out = await t.svc.addManga({ manga_id: 'E8uHNgs8', source: 'other' });
    expect(out.status).toBe('expired');
  });

  it('submit_sign=2: cancelled, writes nothing', async () => {
    const t = setup();
    t.searchCache.putMany([candidate()]);
    const out = await t.svc.addManga({ manga_id: 'E8uHNgs8', source: 'dgmanga', submit_sign: '2' });
    expect(out.status).toBe('cancelled');
    expect(t.repo.add).not.toHaveBeenCalled();
  });

  it('already in library: exists, writes nothing', async () => {
    const t = setup([stored()]);
    t.searchCache.putMany([candidate()]);
    const out = await t.svc.addManga({ manga_id: 'E8uHNgs8', source: 'dgmanga', submit_sign: '1' });
    expect(out.status).toBe('exists');
    expect(t.repo.add).not.toHaveBeenCalled();
  });

  it('similar title in library: duplicate on submit_sign=0, added on submit_sign=1', async () => {
    const t = setup([
      stored({ manga_id: 'other', manga_name: 'A・S・Gグループフタコマ漫画劇場 2' }),
    ]);
    t.searchCache.putMany([candidate()]);

    const first = await t.svc.addManga({ manga_id: 'E8uHNgs8', source: 'dgmanga', submit_sign: '0' });
    expect(first.status).toBe('duplicate');
    expect(first.duplicates).toEqual(['A・S・Gグループフタコマ漫画劇場 2']);
    expect(t.repo.add).not.toHaveBeenCalled();

    const forced = await t.svc.addManga({ manga_id: 'E8uHNgs8', source: 'dgmanga', submit_sign: '1' });
    expect(forced.status).toBe('added');
    expect(t.store.has('E8uHNgs8')).toBe(true);
  });
});

describe('LibraryService.deleteManga', () => {
  it('removes the download folder and the library entry', async () => {
    const t = setup([stored()]);
    await expect(t.svc.deleteManga('E8uHNgs8')).resolves.toBe(true);
    expect(t.fsService.removeDir).toHaveBeenCalledWith(
      join(DOWNLOAD_ROOT, 'A・S・Gグループフタコマ漫画劇場$E8uHNgs8'),
    );
    expect(t.store.has('E8uHNgs8')).toBe(false);
  });

  it('removes the on-disk folder of a manga whose name contains a slash', async () => {
    const t = setup([stored({ manga_name: 'Fate / Strange Fake' })]);
    await expect(t.svc.deleteManga('E8uHNgs8')).resolves.toBe(true);
    expect(t.fsService.removeDir).toHaveBeenCalledWith(
      join(DOWNLOAD_ROOT, 'Fate - Strange Fake$E8uHNgs8'),
    );
  });

  it('keeps the entry when the folder cannot be removed', async () => {
    const t = setup([stored()]);
    t.fsService.removeDir.mockRejectedValueOnce(new Error('EBUSY'));
    await expect(t.svc.deleteManga('E8uHNgs8')).resolves.toBe(false);
    expect(t.store.has('E8uHNgs8')).toBe(true);
  });

  it('throws NotFound for an unknown manga', async () => {
    const t = setup();
    await expect(t.svc.deleteManga('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LibraryService.toggleAutoUpdate', () => {
  it('flips download_switch both ways', async () => {
    const t = setup([stored({ download_switch: 0 })]);
    await expect(t.svc.toggleAutoUpdate('E8uHNgs8')).resolves.toBe(1);
    await expect(t.svc.toggleAutoUpdate('E8uHNgs8')).resolves.toBe(0);
    expect(t.store.get('E8uHNgs8')?.download_switch).toBe(0);
  });
});
