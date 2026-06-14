import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { SearchResultDto } from '../scraper/dto';

interface CacheEntry {
  value: SearchResultDto;
  expiresAt: number;
}

/** In-memory cache of recent search candidates, keyed by `source:manga_id`.
 *
 *  Purpose: let the frontend add a manga by submitting just
 *  {source, manga_id, submit_sign} instead of echoing the candidate's base64
 *  cover thumbnail back to the server (which already produced it during
 *  search). On add, the server resolves the full candidate — including the
 *  thumbnail — from here.
 *
 *  TTL + FIFO size cap keep memory bounded; on a miss (entry expired/evicted)
 *  the caller falls back to telling the client to re-search. */
@Injectable()
export class SearchCacheService {
  private readonly logger = new Logger(SearchCacheService.name);
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  /** Map preserves insertion order, which we exploit for FIFO eviction. */
  private readonly store = new Map<string, CacheEntry>();

  constructor(config: ConfigService<AppConfig, true>) {
    this.ttlMs = config.get('searchCache.ttlMs', { infer: true });
    this.maxEntries = config.get('searchCache.maxEntries', { infer: true });
  }

  private key(source: string, mangaId: string): string {
    return `${source}:${mangaId}`;
  }

  put(candidate: SearchResultDto): void {
    const source = candidate.source ?? 'dgmanga';
    const k = this.key(source, candidate.manga_id);
    // Re-insert at the end so the freshest entries are evicted last.
    this.store.delete(k);
    this.store.set(k, { value: candidate, expiresAt: Date.now() + this.ttlMs });
    this.evict();
  }

  putMany(candidates: SearchResultDto[]): void {
    candidates.forEach((c) => this.put(c));
  }

  get(source: string, mangaId: string): SearchResultDto | null {
    const k = this.key(source, mangaId);
    const entry = this.store.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(k);
      return null;
    }
    return entry.value;
  }

  private evict(): void {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}
