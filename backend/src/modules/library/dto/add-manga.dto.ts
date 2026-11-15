/** What LibraryService.addManga takes: the fields of the canonical
 *  POST /api/library body. Everything else is resolved from the search
 *  cache. */
export interface AddMangaInput {
  manga_id: string;
  source: string;
  /** '0'/omitted: run the duplicate check; '1': confirmed despite a
   *  duplicate warning; '2': cancelled. */
  submit_sign?: '0' | '1' | '2';
}

export interface DuplicateCheckResponseDto {
  duplicates: string[];
  /** When non-empty, the client must re-submit with submit_sign='1'. */
  needsConfirmation: boolean;
}
