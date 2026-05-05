import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class FilesystemService {
  private readonly logger = new Logger(FilesystemService.name);
  private readonly downloadRoot: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.downloadRoot = this.config.get('storage.downloadRoot', {
      infer: true,
    });
  }

  /** Replaces utils/make_path.py:path_exists_make */
  async ensureDir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }

  /** Build the manga directory tree the scraper expects:
   *  {downloadRoot}/{mangaName}${mangaId}/{mangaName}/
   */
  async ensureMangaTree(
    mangaName: string,
    mangaId: string,
  ): Promise<{ outerDir: string; innerDir: string }> {
    const outerDir = join(this.downloadRoot, `${mangaName}$${mangaId}`);
    const innerDir = join(outerDir, mangaName);
    await this.ensureDir(innerDir);
    return { outerDir, innerDir };
  }

  chapterDir(innerDir: string, chapterTitle: string): string {
    return join(innerDir, chapterTitle);
  }

  async writeImage(
    chapterDir: string,
    fileName: string,
    data: Buffer,
  ): Promise<string> {
    await this.ensureDir(chapterDir);
    const target = join(chapterDir, fileName);
    await fs.writeFile(target, data);
    return target;
  }

  async writeFile(filePath: string, data: Buffer | string): Promise<void> {
    await this.ensureDir(dirname(filePath));
    await fs.writeFile(filePath, data);
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async readJson<T>(filePath: string): Promise<T> {
    const buf = await fs.readFile(filePath, 'utf8');
    return JSON.parse(buf) as T;
  }

  async writeJson(filePath: string, data: unknown): Promise<void> {
    await this.ensureDir(dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<string[]> {
    try {
      return await fs.readdir(path);
    } catch (err) {
      this.logger.warn(`listDir failed for ${path}: ${(err as Error).message}`);
      return [];
    }
  }

  async removeDir(path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true });
  }

  getDownloadRoot(): string {
    return this.downloadRoot;
  }
}
