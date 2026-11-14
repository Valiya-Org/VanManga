import type { Manga, SearchCandidate } from '@/api/types';

export function makeManga(overrides: Partial<Manga> = {}): Manga {
  const manga_id = overrides.manga_id ?? 'm1';
  return {
    manga_id,
    manga_name: `Manga ${manga_id}`,
    artist_name: 'Artist',
    newest_epi: '第10话',
    thumbnail: `/api/library/${encodeURIComponent(manga_id)}/thumbnail`,
    last_epi: 1,
    last_epi_name: '',
    completed: false,
    serialization: 0,
    download_switch: 0,
    add_date: 1_700_000_000,
    updated_at: 1_700_000_000,
    source: 'dgmanga',
    kavita_url: null,
    ...overrides,
  };
}

export function makeCandidate(overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  const manga_id = overrides.manga_id ?? 'c1';
  return {
    manga_id,
    manga_name: `Candidate ${manga_id}`,
    artist_name: 'Artist',
    newest_epi: '第1话',
    thumbnail: `/api/scraper/dgmanga/search-thumbnail/${manga_id}`,
    source: 'dgmanga',
    ...overrides,
  };
}
