/** Output of scraping a single chapter — image URLs only. NestJS owns
 *  the actual download (so it can drive Bull progress + WebSocket events). */
export interface ChapterImagesDto {
  chapterTitle: string;
  imageUrls: string[];
  /** Per-source headers required to fetch the images (e.g. Referer,
   *  User-Agent). NestJS forwards these verbatim when downloading. */
  requestHeaders?: Record<string, string>;
  errorCode?: 429 | 501 | 503;
}
