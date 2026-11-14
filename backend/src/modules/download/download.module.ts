import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { ScraperModule } from '../scraper/scraper.module';
import { DownloadLegacyController } from './download-legacy.controller';
import { DownloadController } from './download.controller';
import { DownloadOrchestratorService } from './download-orchestrator.service';
import { DownloadService } from './download.service';
import { ImageDownloaderService } from './image-downloader.service';
import { TaskQueueService } from './queue/task-queue.service';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 5,
    }),
    LibraryModule,
    ScraperModule,
  ],
  controllers: [DownloadController, DownloadLegacyController],
  providers: [
    TaskQueueService,
    ImageDownloaderService,
    DownloadOrchestratorService,
    DownloadService,
  ],
  exports: [DownloadService, TaskQueueService],
})
export class DownloadModule {}
