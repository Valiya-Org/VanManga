import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { SearchCacheModule } from './modules/search-cache/search-cache.module';
import { FilesystemModule } from './modules/filesystem/filesystem.module';
import { CloudflareModule } from './modules/cloudflare/cloudflare.module';
import { EventsModule } from './modules/events/events.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { LibraryModule } from './modules/library/library.module';
import { DownloadModule } from './modules/download/download.module';
import { FrontendModule } from './modules/frontend/frontend.module';
import { KavitaModule } from './modules/kavita/kavita.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    SearchCacheModule,
    FilesystemModule,
    CloudflareModule,
    EventsModule,
    ScraperModule,
    LibraryModule,
    DownloadModule,
    KavitaModule,
    SchedulerModule,
    FrontendModule,
  ],
})
export class AppModule {}
