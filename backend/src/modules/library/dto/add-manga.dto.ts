import {
  IsBase64,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

/** Accepted by POST /api/library.
 *
 *  Two shapes are valid:
 *   - Full (legacy): the entire candidate dict from search, including the
 *     base64 `thumbnail`. Used by the current Vue frontend.
 *   - Lean: just `{ manga_id, source?, submit_sign? }`. The server resolves
 *     the remaining fields (name, artist, thumbnail, ...) from the search
 *     cache, so the base64 cover never travels back over the wire.
 *
 *  Hence every descriptive field below is optional; the service fills any
 *  gaps from the cache and rejects with a "search-expired" outcome if the
 *  candidate is no longer cached. */
export class AddMangaDto {
  @IsString() manga_id!: string;

  @IsOptional() @IsString() manga_name?: string;
  @IsOptional() @IsString() artist_name?: string;
  @IsOptional() @IsString() newest_epi?: string;

  /** Base64-encoded JPG from the source's search result (full shape only). */
  @IsOptional() @IsString() thumbnail?: string;

  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() recent_update_date?: string;

  /** submit_sign — frontend's confirmation flag.
   *  '0' = first attempt (server should run duplicate check),
   *  '1' = user confirmed despite duplicate warning,
   *  '2' = user explicitly cancelled. */
  @IsOptional() @IsIn(['0', '1', '2']) submit_sign?: '0' | '1' | '2';
}

export class DuplicateCheckResponseDto {
  duplicates!: string[];
  /** When non-empty, frontend must re-submit with submit_sign='1' to override. */
  needsConfirmation!: boolean;
}

export class ToggleSwitchResponseDto {
  currentDownloadStatus!: 0 | 1;
}

export class DeleteMangaResponseDto {
  /** false if the manga is currently downloading or queued. */
  data!: boolean;
}
