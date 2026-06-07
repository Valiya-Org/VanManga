import { Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import { createWriteStream, promises as fs } from 'fs';
import { basename, join } from 'path';
import { FilesystemService } from './filesystem.service';

export interface RezipResult {
  scannedManga: number;
  zippedChapters: number;
  skipped: string[];
  errors: string[];
}

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(private readonly fsService: FilesystemService) {}

  /** Replaces utils/generate_file_path.py:do_zip_compress and
   *  utils/re_zip_downloaded.py:do_zip_compress.
   *
   *  Zips a directory's contents (flat or nested) into `{dir}.zip`,
   *  then removes the original directory.
   *  Returns false if the directory contains sub-directories AND
   *  `enforceFlat` is true (matches Python `re_zip` behaviour).
   */
  async zipDir(dir: string, options: { enforceFlat?: boolean } = {}): Promise<boolean> {
    const { enforceFlat = false } = options;

    if (enforceFlat) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const hasSubdir = entries.some((e) => e.isDirectory());
      if (hasSubdir) {
        return false;
      }
    }

    const outPath = `${dir}.zip`;

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') this.logger.warn(err.message);
        else reject(err);
      });

      archive.pipe(output);
      archive.glob('**/*', {
        cwd: dir,
        ignore: ['~$*'],
        dot: false,
      });
      void archive.finalize();
    });

    await this.fsService.removeDir(dir);
    return true;
  }

  /** Replaces utils/re_zip_downloaded.py:re_zip_downloaded. Walks the
   *  download root with the structure {root}/{outer}/{inner}/{chapter}/
   *  and zips each unzipped chapter folder.
   */
  async rezipDownloadRoot(): Promise<RezipResult> {
    const root = this.fsService.getDownloadRoot();
    const result: RezipResult = {
      scannedManga: 0,
      zippedChapters: 0,
      skipped: [],
      errors: [],
    };

    const outerEntries = await this.fsService.listDir(root);
    for (const outer of outerEntries) {
      const outerPath = join(root, outer);
      result.scannedManga += 1;

      try {
        const innerEntries = await this.fsService.listDir(outerPath);
        for (const inner of innerEntries) {
          const innerPath = join(outerPath, inner);
          const chapters = await this.fsService.listDir(innerPath);
          for (const chapter of chapters) {
            if (chapter.endsWith('.zip')) continue;
            const chapterPath = join(innerPath, chapter);
            try {
              const ok = await this.zipDir(chapterPath, { enforceFlat: true });
              if (ok) {
                result.zippedChapters += 1;
              } else {
                result.skipped.push(chapterPath);
                this.logger.warn(
                  `Inner manga structure abnormal, skipped: ${chapterPath}`,
                );
              }
            } catch (err) {
              const msg = `${chapterPath}: ${(err as Error).message}`;
              result.errors.push(msg);
              this.logger.error(msg);
            }
          }
        }
      } catch (err) {
        const msg = `${outerPath}: ${(err as Error).message}`;
        result.errors.push(msg);
        this.logger.error(msg);
      }
    }

    return result;
  }

  /** Quick helper: zip a single chapter directory after a download finishes. */
  async zipChapter(chapterDir: string): Promise<string> {
    await this.zipDir(chapterDir, { enforceFlat: false });
    return `${basename(chapterDir)}.zip`;
  }
}
