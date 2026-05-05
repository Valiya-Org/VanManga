import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { ScraperModule } from '../scraper/scraper.module';
import { DownloadController } from './download.controller';
import { DownloadOrchestratorService } from './download-orchestrator.service';
import { DownloadService } from './download.service';
import { ImageDownloaderService } from './image-downloader.service';
import { TaskQueueService } from './queue/task-queue.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 5,
    }),
    forwardRef(() => LibraryModule),
    ScraperModule,
  ],
  controllers: [DownloadController],
  providers: [
    TaskQueueService,
    ImageDownloaderService,
    DownloadOrchestratorService,
    DownloadService,
  ],
  exports: [DownloadService, TaskQueueService],
})
export class DownloadModule {}
