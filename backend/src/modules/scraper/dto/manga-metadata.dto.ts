/** Output of `check_manga_length` — current length and serialisation
 *  status of a manga at the source.
 *  Special status codes:
 *    - 501: cloudflare wall hit, retry needed
 *    - 503: scraper error after retries exhausted
 *    - 504: DMCA takedown notice detected (2.1-dev) */
export interface MangaMetadataDto {
  chapterCount: number;
  /** 0 = ongoing (連載中), 1 = completed. Mirrors `serialization` field. */
  serialization: 0 | 1;
  errorCode?: 501 | 503 | 504;
}
