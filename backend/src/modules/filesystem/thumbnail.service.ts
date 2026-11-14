import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, join, resolve } from 'path';
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

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly fsService: FilesystemService,
  ) {
    this.dir = this.config.get('storage.thumbnailsDir', { infer: true });
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
   *  thumbnail field to the relative URL the frontend can fetch. (Flask
   *  baked MANGA_BASE_WEBSOCKET_URL into the record; relative paths keep
   *  the library file independent of the deployment's domain.)
   */
  async persistAndLink<T extends ThumbnailInput>(manga: T): Promise<T> {
    await this.save(manga);
    return {
      ...manga,
      thumbnail: `/api/library/${encodeURIComponent(manga.manga_id)}/thumbnail`,
    };
  }

  async getThumbnailPath(mangaId: string): Promise<string> {
    const file = join(this.dir, `${mangaId}.jpg`);
    // The id comes from the URL; refuse anything that escapes the directory.
    if (resolve(dirname(file)) !== resolve(this.dir)) {
      throw new NotFoundException(`Thumbnail not found for ${mangaId}`);
    }
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
