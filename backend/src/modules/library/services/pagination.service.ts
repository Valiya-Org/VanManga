import { BadRequestException, Injectable } from '@nestjs/common';
import type { Manga } from '../entities/manga.entity';
import type { PaginationResultDto } from '../dto/pagination.dto';

/** Replaces utils/lib_pagination.py:libPagination.
 *  Output shape matches the legacy contract byte-for-byte so the Vue
 *  frontend's pagination component keeps working. */
@Injectable()
export class PaginationService {
  paginate(
    items: Manga[],
    start: number,
    limit: number,
  ): PaginationResultDto {
    const count = items.length;

    if (limit < 0) {
      throw new BadRequestException('limit must be >= 0');
    }
    if (count > 0 && count < start) {
      throw new BadRequestException(
        'start index exceeds library size',
      );
    }

    const previous =
      start === 1
        ? ''
        : { start: Math.max(1, start - limit), limit: start - 1 };

    const next =
      start + limit > count ? '' : { start: start + limit, limit };

    return {
      start,
      limit,
      count,
      previous,
      next,
      lib_paginate: items.slice(start - 1, start - 1 + limit),
    };
  }
}
