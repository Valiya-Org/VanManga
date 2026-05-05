import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { CloudflareService } from './cloudflare.service';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 70_000,
      maxRedirects: 5,
    }),
  ],
  providers: [CloudflareService],
  exports: [CloudflareService, HttpModule],
})
export class CloudflareModule {}
