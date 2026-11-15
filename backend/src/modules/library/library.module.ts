import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { DuplicateCheckService } from './services/duplicate-check.service';
import { MangaFactoryService } from './services/manga-factory.service';

@Module({
  controllers: [LibraryController],
  providers: [
    LibraryRepository,
    LibraryService,
    MangaFactoryService,
    DuplicateCheckService,
  ],
  exports: [LibraryService, LibraryRepository],
})
export class LibraryModule {}
