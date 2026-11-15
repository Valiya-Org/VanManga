import { Injectable } from '@nestjs/common';
import type { SearchResultDto } from '../../scraper/dto';
import type { Manga } from '../entities/manga.entity';

/** Replaces utils/make_manga_object.py:make_manga_object.
 *  Hydrates a search candidate (its `thumbnail` already rewritten to the
 *  cover URL) into a fully-formed Manga with the default counters. */
@Injectable()
export class MangaFactoryService {
  build(candidate: SearchResultDto): Manga {
    const now = Date.now() / 1000; // unix seconds, mirrors utc_time.timestamp()
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
      add_date: now,
      updated_at: now,
      kavita_url: 'None', // 2.1-dev sentinel, frontend handles "None" specially
    };
  }
}
