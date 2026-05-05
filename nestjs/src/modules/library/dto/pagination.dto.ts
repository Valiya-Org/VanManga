import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import type { Manga } from '../entities/manga.entity';

export class PaginationQueryDto {
  /** 1-based start index. Mirrors the legacy `start` field. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  start: number = 1;

  /** Page size. Mirrors the legacy `limit` field. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}

export interface PaginationCursor {
  start: number;
  limit: number;
}

/** Output shape — must match utils/lib_pagination.py exactly so the
 *  Vue frontend keeps consuming it unchanged. */
export interface PaginationResultDto {
  start: number;
  limit: number;
  count: number;
  previous: PaginationCursor | '';
  next: PaginationCursor | '';
  lib_paginate: Manga[];
}
