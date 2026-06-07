import {
  IsBase64,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

/** Accepted by POST /api/library — the candidate dict the frontend sends.
 *  Matches the manga_object payload shape produced by ScraperService.search. */
export class AddMangaDto {
  @IsString() manga_id!: string;
  @IsString() manga_name!: string;
  @IsString() artist_name!: string;
  @IsString() newest_epi!: string;

  /** Base64-encoded JPG from the source's search result. */
  @IsString() thumbnail!: string;

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
