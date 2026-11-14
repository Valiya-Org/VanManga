import type { Manga } from './entities/manga.entity';

/** The Manga record as canonical routes and socket events expose it
 *  (docs/api-contract.md §2). Stored records may predate P2; everything
 *  that differs between old and new files is normalised here, on read,
 *  so the library file itself is never migrated. */
export interface ApiManga
  extends Omit<Manga, 'source' | 'kavita_url' | 'updated_at'> {
  source: string;
  kavita_url: string | null;
  updated_at: number;
}

/** Relative URL of a library manga's cover. */
export function thumbnailPath(mangaId: string): string {
  return `/api/library/${encodeURIComponent(mangaId)}/thumbnail`;
}

export function toApiManga(m: Manga): ApiManga {
  const id = String(m.manga_id);
  return {
    ...m,
    manga_id: id,
    // Old records hold MANGA_BASE_URL-prefixed or /api/dogemanga/... URLs.
    // The file on disk is always <id>.jpg, so the path is derivable.
    thumbnail: thumbnailPath(id),
    source: m.source ?? 'dgmanga',
    kavita_url: m.kavita_url && m.kavita_url !== 'None' ? m.kavita_url : null,
    updated_at: m.updated_at ?? m.add_date,
  };
}
