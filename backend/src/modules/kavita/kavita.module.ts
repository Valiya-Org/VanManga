import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { KavitaController } from './kavita.controller';
import { KavitaService } from './kavita.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 15_000, maxRedirects: 3 }),
    LibraryModule,
  ],
  controllers: [KavitaController],
  providers: [KavitaService],
  exports: [KavitaService],
})
export class KavitaModule {}
