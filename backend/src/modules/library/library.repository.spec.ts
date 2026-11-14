import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FilesystemService } from '../filesystem/filesystem.service';
import type { Manga } from './entities/manga.entity';
import { LibraryRepository } from './library.repository';

describe('LibraryRepository load', () => {
  let dir: string;
  let file: string;

  const create = () => {
    const config = { get: () => file } as never;
    return new LibraryRepository(config, new FilesystemService(config));
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vanmanga-lib-'));
    file = join(dir, 'manga_library.json');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('creates an empty library when the file does not exist', async () => {
    const repo = create();
    await repo.onModuleInit();
    expect(repo.size()).toBe(0);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({});
  });

  it('loads an existing library', async () => {
    await writeFile(file, JSON.stringify({ a: { manga_id: 'a' } }));
    const repo = create();
    await repo.onModuleInit();
    expect(repo.has('a')).toBe(true);
  });

  it('refuses to start on a corrupt file and leaves it untouched', async () => {
    const corrupt = '{"a": {"manga_id": "a"';
    await writeFile(file, corrupt);
    const repo = create();

    await expect(repo.onModuleInit()).rejects.toThrow(/manga_library\.json/);
    expect(await readFile(file, 'utf8')).toBe(corrupt);
  });

  it.each(['[]', 'null', '"text"', '42'])(
    'refuses to start when the file holds %s instead of an object',
    async (content) => {
      await writeFile(file, content);
      await expect(create().onModuleInit()).rejects.toThrow(/not a JSON object/);
      expect(await readFile(file, 'utf8')).toBe(content);
    },
  );

  it('never writes after a failed load', async () => {
    const corrupt = 'not json';
    await writeFile(file, corrupt);
    const repo = create();
    await expect(repo.onModuleInit()).rejects.toThrow();

    await expect(repo.add({ manga_id: 'b' } as Manga)).rejects.toThrow(
      /not loaded/,
    );
    expect(await readFile(file, 'utf8')).toBe(corrupt);
  });
});
