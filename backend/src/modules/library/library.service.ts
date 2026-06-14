import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import type { AppConfig } from '../../config/configuration';
import { FilesystemService } from '../filesystem/filesystem.service';
import { ThumbnailService } from '../filesystem/thumbnail.service';
import { SearchCacheService } from '../search-cache/search-cache.service';
import {
  AddMangaDto,
  DuplicateCheckResponseDto,
  PaginationResultDto,
  ShortMangaDto,
} from './dto';
import type { Manga } from './entities/manga.entity';
import { LibraryRepository } from './library.repository';
import { DuplicateCheckService } from './services/duplicate-check.service';
import { MangaFactoryService } from './services/manga-factory.service';
import { PaginationService } from './services/pagination.service';

export interface AddMangaOutcome {
  status: 'added' | 'duplicate' | 'cancelled' | 'exists' | 'expired';
  manga?: Manga;
  duplicates?: string[];
}

/** A candidate with every field the add pipeline needs guaranteed present —
 *  either supplied in full by the client or filled in from the search cache. */
type ResolvedCandidate = AddMangaDto & {
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  thumbnail: string;
};

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly downloadRoot: string;

  constructor(
    private readonly repo: LibraryRepository,
    private readonly factory: MangaFactoryService,
    private readonly dedupe: DuplicateCheckService,
    private readonly pagination: PaginationService,
    private readonly thumbnails: ThumbnailService,
    private readonly fsService: FilesystemService,
    private readonly searchCache: SearchCacheService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    this.downloadRoot = this.config.get('storage.downloadRoot', {
      infer: true,
    });
  }

  // -------------------------------------------------------------- queries

  list(): Manga[] {
    return this.repo.list();
  }

  shortList(): ShortMangaDto[] {
    return this.repo.list().map((m) => ({
      manga_id: m.manga_id,
      manga_name: m.manga_name,
    }));
  }

  paginate(start: number, limit: number): PaginationResultDto {
    return this.pagination.paginate(this.repo.list(), start, limit);
  }

  /** Search-within-library — borrowed from 2.1-dev's /libsearch. */
  searchInLibrary(query: string): Manga[] {
    const q = query.trim();
    if (q === '') return [];
    return this.repo.list().filter(
      (m) =>
        m.manga_name.includes(q) ||
        m.artist_name.includes(q) ||
        m.manga_id.includes(q),
    );
  }

  get(mangaId: string): Manga {
    const manga = this.repo.get(mangaId);
    if (!manga) throw new NotFoundException(`Unknown manga: ${mangaId}`);
    return manga;
  }

  has(mangaId: string): boolean {
    return this.repo.has(mangaId);
  }

  checkDuplicates(name: string): DuplicateCheckResponseDto {
    const duplicates = this.dedupe.findCloseMatches(name, this.repo.list());
    return { duplicates, needsConfirmation: duplicates.length > 0 };
  }

  // ------------------------------------------------------------ mutations

  /** End-to-end "add manga to library" flow.
   *
   *  Mirrors main.py:DogePost.post():
   *   - submit_sign='2' → user cancelled, no-op
   *   - submit_sign undefined/'0' → run duplicate check; if hits, return
   *     duplicates and ask the frontend to re-submit
   *   - submit_sign='1' → user confirmed; persist the manga
   *
   *  The thumbnail base64 is offloaded to disk and the entity's
   *  `thumbnail` field is rewritten to a public URL. */
  async addManga(input: AddMangaDto): Promise<AddMangaOutcome> {
    if (input.submit_sign === '2') {
      return { status: 'cancelled' };
    }

    if (this.repo.has(input.manga_id)) {
      return { status: 'exists', manga: this.repo.get(input.manga_id) };
    }

    // Resolve the full candidate: either the client sent everything (legacy
    // base64 payload) or we fill the gaps from the search cache (lean payload).
    const candidate = this.resolveCandidate(input);
    if (!candidate) {
      return { status: 'expired' };
    }

    if (input.submit_sign !== '1') {
      const dup = this.checkDuplicates(candidate.manga_name);
      if (dup.needsConfirmation) {
        return { status: 'duplicate', duplicates: dup.duplicates };
      }
    }

    const persisted = await this.thumbnails.persistAndLink(candidate);
    const manga = this.factory.build({
      ...candidate,
      thumbnail: persisted.thumbnail,
    });

    await this.repo.add(manga);
    this.logger.log(
      `Added manga: ${manga.manga_name} (${manga.manga_id}) from ${manga.source}`,
    );
    return { status: 'added', manga };
  }

  /** Turn an add request into a fully-populated candidate.
   *
   *  Full (legacy) payloads already carry name/artist/epi/thumbnail; lean
   *  payloads carry just the id, so we look the rest up in the search cache.
   *  Any field the client *did* send wins over the cached value. Returns null
   *  when a lean payload references a candidate that is no longer cached. */
  private resolveCandidate(input: AddMangaDto): ResolvedCandidate | null {
    if (
      input.thumbnail &&
      input.manga_name &&
      input.artist_name &&
      input.newest_epi
    ) {
      return input as ResolvedCandidate;
    }

    const source = input.source ?? 'dgmanga';
    const cached = this.searchCache.get(source, input.manga_id);
    if (!cached) return null;

    return {
      manga_id: input.manga_id,
      manga_name: input.manga_name ?? cached.manga_name,
      artist_name: input.artist_name ?? cached.artist_name,
      newest_epi: input.newest_epi ?? cached.newest_epi,
      thumbnail: input.thumbnail ?? cached.thumbnail,
      source,
      recent_update_date:
        input.recent_update_date ?? cached.recent_update_date,
      submit_sign: input.submit_sign,
    };
  }

  async toggleAutoUpdate(mangaId: string): Promise<0 | 1> {
    const manga = this.get(mangaId);
    const next: 0 | 1 = manga.download_switch === 1 ? 0 : 1;
    await this.repo.update(mangaId, { download_switch: next });
    this.logger.log(`download_switch for ${mangaId} -> ${next}`);
    return next;
  }

  /** Delete a manga from library AND remove its files from disk.
   *  Caller (controller) is responsible for the "currently downloading
   *  or queued" guard since LibraryModule does not import DownloadModule. */
  async deleteManga(mangaId: string): Promise<boolean> {
    const manga = this.repo.get(mangaId);
    if (!manga) throw new NotFoundException(`Unknown manga: ${mangaId}`);

    const folder = join(
      this.downloadRoot,
      `${manga.manga_name}$${mangaId}`,
    );

    try {
      if (await this.fsService.exists(folder)) {
        await this.fsService.removeDir(folder);
      }
    } catch (err) {
      this.logger.error(
        `Failed to remove manga folder ${folder}: ${(err as Error).message}`,
      );
      return false;
    }

    await this.repo.remove(mangaId);
    this.logger.log(`Deleted manga: ${manga.manga_name} (${mangaId})`);
    return true;
  }

  /** Patch arbitrary fields. Used by Kavita sync, scheduler, download
   *  finisher to update last_epi / kavita_url / serialization / etc. */
  async patch(mangaId: string, patch: Partial<Manga>): Promise<Manga> {
    const next = await this.repo.update(mangaId, patch);
    if (!next) throw new NotFoundException(`Unknown manga: ${mangaId}`);
    return next;
  }
}
