import { BadRequestException } from '@nestjs/common';
import { PaginationService } from './pagination.service';
import type { Manga } from '../entities/manga.entity';

function makeManga(id: string): Manga {
  return {
    manga_id: id,
    manga_name: `Manga ${id}`,
    artist_name: 'test',
    newest_epi: '1',
    thumbnail: '',
    last_epi: 1,
    last_epi_name: '',
    completed: false,
    serialization: 0,
    download_switch: 0,
    add_date: Date.now(),
  };
}

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(() => {
    service = new PaginationService();
  });

  const items = Array.from({ length: 25 }, (_, i) =>
    makeManga(String(i + 1)),
  );

  it('should return first page', () => {
    const result = service.paginate(items, 1, 10);
    expect(result.count).toBe(25);
    expect(result.start).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.lib_paginate).toHaveLength(10);
    expect(result.previous).toBe('');
    expect(result.next).toEqual({ start: 11, limit: 10 });
  });

  it('should return middle page', () => {
    const result = service.paginate(items, 11, 10);
    expect(result.lib_paginate).toHaveLength(10);
    expect(result.previous).toEqual({ start: 1, limit: 10 });
    expect(result.next).toEqual({ start: 21, limit: 10 });
  });

  it('should return last page', () => {
    const result = service.paginate(items, 21, 10);
    expect(result.lib_paginate).toHaveLength(5);
    expect(result.next).toBe('');
  });

  it('should handle empty library', () => {
    const result = service.paginate([], 1, 10);
    expect(result.count).toBe(0);
    expect(result.lib_paginate).toHaveLength(0);
    expect(result.previous).toBe('');
    expect(result.next).toBe('');
  });

  it('should throw on negative limit', () => {
    expect(() => service.paginate(items, 1, -1)).toThrow(
      BadRequestException,
    );
  });

  it('should throw when start exceeds size', () => {
    expect(() => service.paginate(items, 100, 10)).toThrow(
      BadRequestException,
    );
  });

  it('should work with limit=1', () => {
    const result = service.paginate(items, 1, 1);
    expect(result.lib_paginate).toHaveLength(1);
    expect(result.lib_paginate[0].manga_id).toBe('1');
    expect(result.next).toEqual({ start: 2, limit: 1 });
  });
});
