import { Type } from 'class-transformer';
import { IsIn, IsOptional, ValidateNested } from 'class-validator';
import { AddMangaDto } from './add-manga.dto';

/** Legacy body for POST /api/dogemanga/confirm.
 *
 *  The Vue frontend nests the candidate manga under `manga_object` and sends
 *  `submit_sign` as a sibling field (see frontend `api/dogemanga.ts`
 *  `confirmSelection`). This mirrors the old Flask `DogePost`, which did
 *  `ast.literal_eval(args["manga_object"])`. The canonical POST /api/library
 *  route takes the flat `AddMangaDto` instead. */
export class ConfirmMangaLegacyDto {
  @ValidateNested()
  @Type(() => AddMangaDto)
  manga_object!: AddMangaDto;

  /** Confirmation flag — see `AddMangaDto.submit_sign`. */
  @IsOptional()
  @IsIn(['0', '1', '2'])
  submit_sign?: '0' | '1' | '2';
}
