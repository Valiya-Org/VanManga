import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body of the canonical POST /api/library. Only these three fields are
 *  read (the global ValidationPipe strips anything else); the rest of the
 *  record is resolved from the search cache. */
export class LeanAddMangaDto {
  @ApiProperty({ example: '-LoL2tSY' })
  @IsString()
  @IsNotEmpty()
  manga_id!: string;

  @ApiProperty({ example: 'dgmanga' })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiPropertyOptional({
    enum: ['0', '1', '2'],
    description: "'0'/omitted: check duplicates; '1': confirmed; '2': cancelled",
  })
  @IsOptional()
  @IsIn(['0', '1', '2'])
  submit_sign?: '0' | '1' | '2';
}
