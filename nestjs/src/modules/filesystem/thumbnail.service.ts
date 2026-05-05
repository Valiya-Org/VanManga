import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import type { AppConfig } from '../../config/configuration';
import { FilesystemService } from './filesystem.service';

export interface ThumbnailInput {
  manga_id: string;
  thumbnail: string; // base64 string
}

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly dir: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly fsService: FilesystemService,
  ) {
    this.dir = this.config.get('storage.thumbnailsDir', { infer: true });
    this.publicBaseUrl = this.config.get('frontend.websocketUrl', {
      infer: true,
    });
  }

  /** Replaces utils/save_thumbnail.py:saveThumbnail.
   *  Persists a base64-encoded thumbnail and returns the filename.
   */
  async save(manga: ThumbnailInput): Promise<string> {
    await this.fsService.ensureDir(this.dir);
    const fileName = `${manga.manga_id}.jpg`;
    const target = join(this.dir, fileName);
    await this.fsService.writeFile(target, Buffer.from(manga.thumbnail, 'base64'));
    return fileName;
  }

  /** Replaces utils/thumbnails_creator.py:thumbnails_creator.
   *  Persists the base64 thumbnail and rewrites the manga object's
   *  thumbnail field to the public URL the frontend can fetch.
   */
  async persistAndLink<T extends ThumbnailInput>(manga: T): Promise<T> {
    await this.save(manga);
    return {
      ...manga,
      thumbnail: `${this.publicBaseUrl}/api/library/${manga.manga_id}/thumbnail`,
    };
  }

  async getThumbnailPath(mangaId: string): Promise<string> {
    const file = join(this.dir, `${mangaId}.jpg`);
    if (!(await this.fsService.exists(file))) {
      throw new NotFoundException(`Thumbnail not found for ${mangaId}`);
    }
    return file;
  }

  async readThumbnail(mangaId: string): Promise<Buffer> {
    const path = await this.getThumbnailPath(mangaId);
    return this.fsService.readFile(path);
  }
}
