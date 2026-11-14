import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UnknownSourceException } from '../../../common/http/api-exception';
import {
  IMangaSource,
  MANGA_SOURCE_TOKEN,
} from '../interfaces/manga-source.interface';

/** Holds every IMangaSource provider registered in ScraperModule.
 *  Adding a new source = add it to the providers array bound to
 *  MANGA_SOURCE_TOKEN; this service exposes it automatically. */
@Injectable()
export class SourceRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SourceRegistryService.name);
  private readonly byName = new Map<string, IMangaSource>();

  constructor(
    @Inject(MANGA_SOURCE_TOKEN) private readonly sources: IMangaSource[],
  ) {}

  onModuleInit(): void {
    for (const source of this.sources) {
      if (this.byName.has(source.name)) {
        throw new Error(`Duplicate manga source registered: ${source.name}`);
      }
      this.byName.set(source.name, source);
      this.logger.log(`Registered manga source: ${source.name} (${source.displayName})`);
    }
  }

  get(name: string): IMangaSource {
    const source = this.byName.get(name);
    if (!source) {
      throw new UnknownSourceException(name, this.list());
    }
    return source;
  }

  list(): string[] {
    return Array.from(this.byName.keys());
  }

  describe(): { name: string; displayName: string }[] {
    return Array.from(this.byName.values()).map((s) => ({
      name: s.name,
      displayName: s.displayName,
    }));
  }
}
