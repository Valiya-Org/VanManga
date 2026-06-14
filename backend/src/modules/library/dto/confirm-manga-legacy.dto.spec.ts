import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddMangaDto } from './add-manga.dto';
import { ConfirmMangaLegacyDto } from './confirm-manga-legacy.dto';

const candidate = {
  manga_id: '123',
  manga_name: 'Naruto',
  artist_name: 'Kishimoto',
  newest_epi: '700',
  thumbnail: 'base64data',
};

describe('ConfirmMangaLegacyDto', () => {
  it('accepts the nested { manga_object, submit_sign } shape the frontend sends', async () => {
    const dto = plainToInstance(ConfirmMangaLegacyDto, {
      manga_object: candidate,
      submit_sign: '0',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.manga_object).toBeInstanceOf(AddMangaDto);
    expect(dto.manga_object.manga_id).toBe('123');
    expect(dto.submit_sign).toBe('0');
  });

  it('allows submit_sign to be omitted', async () => {
    const dto = plainToInstance(ConfirmMangaLegacyDto, {
      manga_object: candidate,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a lean manga_object with only manga_id (server fills the rest from the search cache)', async () => {
    const dto = plainToInstance(ConfirmMangaLegacyDto, {
      manga_object: { manga_id: '123' },
      submit_sign: '1',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects when manga_id itself is missing', async () => {
    const dto = plainToInstance(ConfirmMangaLegacyDto, {
      manga_object: { manga_name: 'Naruto' },
      submit_sign: '1',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid submit_sign value', async () => {
    const dto = plainToInstance(ConfirmMangaLegacyDto, {
      manga_object: candidate,
      submit_sign: '9',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
