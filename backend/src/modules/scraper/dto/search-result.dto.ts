/** Result of a search query against a manga source.
 *  Mirrors the dict shape produced by the legacy DGmanga.search_manga. */
export interface SearchResultDto {
  manga_id: string;
  manga_name: string;
  artist_name: string;
  newest_epi: string;
  thumbnail: string; // base64-encoded JPG payload
  /** Optional, captured by some sources during search (e.g. 2.1-dev). */
  recent_update_date?: string;
  /** Source identifier — set by NestJS, not the Python script. */
  source?: string;
}
