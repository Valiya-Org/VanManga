import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import type { AppConfig } from '../../config/configuration';
import { FilesystemService } from '../filesystem/filesystem.service';
import type { Manga, MangaLibrary } from './entities/manga.entity';

/**
 * Persistence layer for manga_library.json.
 *
 *  Design:
 *   - Library is loaded once on boot, kept in memory, and re-flushed on
 *     every mutation (mirrors main.py behaviour).
 *   - All mutating methods funnel through `mutate()` which serialises
 *     writes via an in-process queue. The legacy code relied on Python's
 *     GIL for this; Node.js needs an explicit mutex.
 *   - Atomic write: writes go to `lib.json.tmp` and rename, so a crash
 *     mid-write cannot corrupt the file.
 *
 *  This stays as a JSON file in v1 to preserve compatibility with the
 *  existing user file. Stage 7 may swap to SQLite/Prisma without
 *  changing this repository's public surface.
 */
@Injectable()
export class LibraryRepository implements OnModuleInit {
  private readonly logger = new Logger(LibraryRepository.name);
  private readonly libraryPath: string;
  private library: MangaLibrary = {};
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly fsService: FilesystemService,
  ) {
    this.libraryPath = this.config.get('storage.libraryFile', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      if (!(await this.fsService.exists(this.libraryPath))) {
        await this.fsService.ensureDir(dirname(this.libraryPath));
        this.library = {};
        await this.flushAtomic(this.library);
        this.logger.log(`Created new manga library at ${this.libraryPath}`);
        return;
      }
      this.library = await this.fsService.readJson<MangaLibrary>(
        this.libraryPath,
      );
      this.logger.log(
        `Loaded ${Object.keys(this.library).length} manga from ${this.libraryPath}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to load library at ${this.libraryPath}: ${(err as Error).message} — starting empty`,
      );
      this.library = {};
    }
  }

  private async flushAtomic(snapshot: MangaLibrary): Promise<void> {
    const tmp = `${this.libraryPath}.tmp`;
    const json = JSON.stringify(snapshot, null, 4);
    await this.fsService.writeFile(tmp, json);
    await fs.rename(tmp, this.libraryPath);
  }

  /** Schedule a write so concurrent mutations serialise. */
  private mutate<T>(fn: (lib: MangaLibrary) => T | Promise<T>): Promise<T> {
    const next = this.writeQueue.then(async () => {
      const result = await fn(this.library);
      await this.flushAtomic(this.library);
      return result;
    });
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  // -------------------------------------------------------------- read API

  list(): Manga[] {
    return Object.values(this.library);
  }

  has(mangaId: string): boolean {
    return mangaId in this.library;
  }

  get(mangaId: string): Manga | undefined {
    return this.library[mangaId];
  }

  size(): number {
    return Object.keys(this.library).length;
  }

  /** Read-only snapshot (do not mutate the result). */
  snapshot(): MangaLibrary {
    return this.library;
  }

  // ------------------------------------------------------------- write API

  add(manga: Manga): Promise<void> {
    return this.mutate((lib) => {
      lib[manga.manga_id] = manga;
    });
  }

  update(mangaId: string, patch: Partial<Manga>): Promise<Manga | undefined> {
    return this.mutate((lib) => {
      const current = lib[mangaId];
      if (!current) return undefined;
      lib[mangaId] = { ...current, ...patch };
      return lib[mangaId];
    });
  }

  remove(mangaId: string): Promise<boolean> {
    return this.mutate((lib) => {
      if (!(mangaId in lib)) return false;
      delete lib[mangaId];
      return true;
    });
  }

  /** Bulk replace (used by Kavita sync, serialization rescan, etc.). */
  replaceAll(library: MangaLibrary): Promise<void> {
    return this.mutate((lib) => {
      // mutate the same object reference so other in-memory consumers stay valid
      for (const key of Object.keys(lib)) delete lib[key];
      Object.assign(lib, library);
    });
  }
}
