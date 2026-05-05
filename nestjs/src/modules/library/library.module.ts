import { forwardRef, Module } from '@nestjs/common';
import { DownloadModule } from '../download/download.module';
import { LibraryController } from './library.controller';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
import { DuplicateCheckService } from './services/duplicate-check.service';
import { MangaFactoryService } from './services/manga-factory.service';
import { PaginationService } from './services/pagination.service';

@Module({
  imports: [forwardRef(() => DownloadModule)],
  controllers: [LibraryController],
  providers: [
    LibraryRepository,
    LibraryService,
    MangaFactoryService,
    DuplicateCheckService,
    PaginationService,
  ],
  exports: [LibraryService, LibraryRepository],
})
export class LibraryModule {}
