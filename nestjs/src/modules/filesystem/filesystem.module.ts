import { Global, Module } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { FilesystemService } from './filesystem.service';
import { ThumbnailService } from './thumbnail.service';

@Global()
@Module({
  providers: [FilesystemService, ArchiveService, ThumbnailService],
  exports: [FilesystemService, ArchiveService, ThumbnailService],
})
export class FilesystemModule {}
