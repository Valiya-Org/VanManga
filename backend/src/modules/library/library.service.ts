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
  status: 'added' | 'duplicate' | 'cancelled' | 'exists';
  manga?: Manga;
  duplicates?: string[];
}

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

    if (input.submit_sign !== '1') {
      const dup = this.checkDuplicates(input.manga_name);
      if (dup.needsConfirmation) {
        return { status: 'duplicate', duplicates: dup.duplicates };
      }
    }

    const persisted = await this.thumbnails.persistAndLink(input);
    const manga = this.factory.build({
      ...input,
      thumbnail: persisted.thumbnail,
    });

    await this.repo.add(manga);
    this.logger.log(
      `Added manga: ${manga.manga_name} (${manga.manga_id}) from ${manga.source}`,
    );
    return { status: 'added', manga };
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
