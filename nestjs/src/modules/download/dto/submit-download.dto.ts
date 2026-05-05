import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SubmitFullDownloadDto {
  @IsString() manga_id!: string;
}

export class ChapterPickDto {
  @IsInt() index!: number;
  @IsString() title!: string;
  @IsString() url!: string;
}

export class SubmitRedownloadDto {
  @IsString() manga_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChapterPickDto)
  chapters!: ChapterPickDto[];
}
