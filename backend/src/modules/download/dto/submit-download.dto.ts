import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SubmitFullDownloadDto {
  @ApiProperty({ example: '-LoL2tSY' })
  @IsString()
  @IsNotEmpty()
  manga_id!: string;
}

export class ChapterPickDto {
  @ApiProperty({ example: 1 }) @IsInt() index!: number;
  @ApiProperty({ example: '第1话' }) @IsString() title!: string;
  @ApiProperty({ example: 'https://dogemanga.com/p/abc' }) @IsString() url!: string;
}

export class SubmitRedownloadDto {
  @ApiProperty({ example: '-LoL2tSY' })
  @IsString()
  @IsNotEmpty()
  manga_id!: string;

  @ApiProperty({ type: [ChapterPickDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChapterPickDto)
  chapters!: ChapterPickDto[];
}
