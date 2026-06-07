import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DownloadModule } from '../download/download.module';
import { KavitaModule } from '../kavita/kavita.module';
import { LibraryModule } from '../library/library.module';
import { ScraperModule } from '../scraper/scraper.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    LibraryModule,
    ScraperModule,
    DownloadModule,
    KavitaModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
