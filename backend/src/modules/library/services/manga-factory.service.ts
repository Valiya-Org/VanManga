import { Injectable } from '@nestjs/common';
import type { AddMangaDto } from '../dto';
import type { Manga } from '../entities/manga.entity';

/** A candidate with the descriptive fields guaranteed present (the add
 *  pipeline resolves them from the request or the search cache first). */
type ResolvedCandidate = AddMangaDto & {
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  thumbnail: string;
};

/** Replaces utils/make_manga_object.py:make_manga_object.
 *  Hydrates user-submitted candidate data into a fully-formed Manga
 *  with sensible defaults. */
@Injectable()
export class MangaFactoryService {
  build(candidate: ResolvedCandidate): Manga {
    return {
      manga_id: candidate.manga_id,
      manga_name: candidate.manga_name,
      artist_name: candidate.artist_name,
      newest_epi: candidate.newest_epi,
      thumbnail: candidate.thumbnail,
      source: candidate.source ?? 'dgmanga',
      recent_update_date: candidate.recent_update_date,

      // defaults — match utils/make_manga_object.py exactly
      last_epi: 1,
      last_epi_name: '',
      completed: false,
      serialization: 0,
      download_switch: 0,
      add_date: Date.now() / 1000, // unix seconds, mirrors utc_time.timestamp()
      kavita_url: 'None', // 2.1-dev sentinel, frontend handles "None" specially
    };
  }
}
