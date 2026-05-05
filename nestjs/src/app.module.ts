import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { FilesystemModule } from './modules/filesystem/filesystem.module';
import { CloudflareModule } from './modules/cloudflare/cloudflare.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [ConfigModule, FilesystemModule, CloudflareModule, EventsModule],
})
export class AppModule {}
