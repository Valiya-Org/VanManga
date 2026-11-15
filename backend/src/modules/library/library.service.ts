import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MangaNotFoundException } from '../../common/http/api-exception';
import { join } from 'path';
import type { AppConfig } from '../../config/configuration';
import { FilesystemService } from '../filesystem/filesystem.service';
import { mangaFolderName } from '../filesystem/manga-path';
import { ThumbnailService } from '../filesystem/thumbnail.service';
import { SearchCacheService } from '../search-cache/search-cache.service';
import type { SearchResultDto } from '../scraper/dto';
import { AddMangaInput, DuplicateCheckResponseDto } from './dto';
import type { Manga } from './entities/manga.entity';
import { LibraryRepository } from './library.repository';
import { DuplicateCheckService } from './services/duplicate-check.service';
import { MangaFactoryService } from './services/manga-factory.service';

export interface AddMangaOutcome {
  status: 'added' | 'duplicate' | 'cancelled' | 'exists' | 'expired';
  manga?: Manga;
  duplicates?: string[];
}

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly downloadRoot: string;
  /** Ids whose deleteManga is in progress. */
  private readonly deleting = new Set<string>();

  constructor(
    private readonly repo: LibraryRepository,
    private readonly factory: MangaFactoryService,
    private readonly dedupe: DuplicateCheckService,
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

  get(mangaId: string): Manga {
    const manga = this.repo.get(mangaId);
    if (!manga) throw new MangaNotFoundException(mangaId);
    return manga;
  }

  /** False while the manga is being deleted, so no download can be queued
   *  for it (DownloadService) or recreate its folder (orchestrator) between
   *  the delete's busy check and the record's removal. */
  has(mangaId: string): boolean {
    return this.repo.has(mangaId) && !this.deleting.has(mangaId);
  }

  checkDuplicates(name: string): DuplicateCheckResponseDto {
    const duplicates = this.dedupe.findCloseMatches(name, this.repo.list());
    return { duplicates, needsConfirmation: duplicates.length > 0 };
  }

  // ------------------------------------------------------------ mutations

  /** End-to-end "add manga to library" flow:
   *   - submit_sign='2' → user cancelled, no-op
   *   - submit_sign undefined/'0' → run duplicate check; if hits, return
   *     duplicates and ask the client to re-submit
   *   - submit_sign='1' → user confirmed; persist the manga
   *
   *  The candidate (including its base64 cover) comes from the search
   *  cache; the cover is written to disk and the entity's `thumbnail`
   *  field becomes the relative cover URL. */
  async addManga(input: AddMangaInput): Promise<AddMangaOutcome> {
    if (input.submit_sign === '2') {
      return { status: 'cancelled' };
    }

    if (this.repo.has(input.manga_id)) {
      return { status: 'exists', manga: this.repo.get(input.manga_id) };
    }

    const cached = this.searchCache.get(input.source, input.manga_id);
    if (!cached) {
      return { status: 'expired' };
    }

    if (input.submit_sign !== '1') {
      const dup = this.checkDuplicates(cached.manga_name);
      if (dup.needsConfirmation) {
        return { status: 'duplicate', duplicates: dup.duplicates };
      }
    }

    const candidate: SearchResultDto = { ...cached, source: input.source };
    const persisted = await this.thumbnails.persistAndLink(candidate);
    const manga = this.factory.build(persisted);

    await this.repo.add(manga);
    this.logger.log(
      `=== MANGA ADDED: ${manga.manga_name} (${manga.manga_id}) from ${manga.source} ===`,
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
    if (!manga) throw new MangaNotFoundException(mangaId);

    const folder = join(
      this.downloadRoot,
      mangaFolderName(manga.manga_name, mangaId),
    );

    this.deleting.add(mangaId);
    try {
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
    } finally {
      this.deleting.delete(mangaId);
    }
    await this.thumbnails.remove(mangaId);
    this.logger.log(`=== MANGA DELETED: ${manga.manga_name} (${mangaId}) ===`);
    return true;
  }

  /** Patch arbitrary fields. Used by Kavita sync, scheduler, download
   *  finisher to update last_epi / kavita_url / serialization / etc. */
  async patch(mangaId: string, patch: Partial<Manga>): Promise<Manga> {
    const next = await this.repo.update(mangaId, patch);
    if (!next) throw new MangaNotFoundException(mangaId);
    return next;
  }
}
