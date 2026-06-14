import { Global, Module } from '@nestjs/common';
import { SearchCacheService } from './search-cache.service';

/** Global so both the scraper (which fills the cache on search) and the
 *  library (which resolves candidates on add) can inject it without a
 *  module-to-module dependency. */
@Global()
@Module({
  providers: [SearchCacheService],
  exports: [SearchCacheService],
})
export class SearchCacheModule {}
