import { Module } from '@nestjs/common';
import { MANGA_SOURCE_TOKEN } from './interfaces/manga-source.interface';
import { PythonRunnerService } from './python/python-runner.service';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';
import { DGmangaSource } from './sources/dgmanga.source';
import { SourceRegistryService } from './sources/source-registry.service';

/**
 * To add a new manga source:
 *   1. Add a new class under `sources/<name>.source.ts` implementing
 *      `IMangaSource` (it just shells out to scrape_cli.py).
 *   2. Add it to the `sources` const below — both as a provider class
 *      and as an entry of `MANGA_SOURCE_TOKEN`.
 *   3. Register the matching Python handler in
 *      `../scrape_cli.py:SOURCE_REGISTRY`.
 */
const sources = [DGmangaSource];

@Module({
  controllers: [ScraperController],
  providers: [
    PythonRunnerService,
    SourceRegistryService,
    ScraperService,
    ...sources,
    {
      provide: MANGA_SOURCE_TOKEN,
      useFactory: (...impls) => impls,
      inject: sources,
    },
  ],
  exports: [ScraperService, SourceRegistryService],
})
export class ScraperModule {}
