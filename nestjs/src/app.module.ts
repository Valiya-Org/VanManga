import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { FilesystemModule } from './modules/filesystem/filesystem.module';
import { CloudflareModule } from './modules/cloudflare/cloudflare.module';
import { EventsModule } from './modules/events/events.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { LibraryModule } from './modules/library/library.module';
import { DownloadModule } from './modules/download/download.module';

@Module({
  imports: [
    ConfigModule,
    FilesystemModule,
    CloudflareModule,
    EventsModule,
    ScraperModule,
    LibraryModule,
    DownloadModule,
  ],
})
export class AppModule {}
