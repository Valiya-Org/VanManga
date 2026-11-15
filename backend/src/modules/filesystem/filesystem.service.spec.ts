import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FilesystemService } from './filesystem.service';

describe('FilesystemService.ensureMangaTree', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vanmanga-fs-'));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('does not create nested directories for a name containing a slash', async () => {
    const svc = new FilesystemService({ get: () => root } as never);
    const tree = await svc.ensureMangaTree('Fate / Strange Fake', 'abc');

    expect(tree.outerDir).toBe(join(root, 'Fate - Strange Fake$abc'));
    expect(tree.innerDir).toBe(
      join(root, 'Fate - Strange Fake$abc', 'Fate - Strange Fake'),
    );
    expect((await stat(tree.innerDir)).isDirectory()).toBe(true);
  });
});

describe('FilesystemService.chapterDir', () => {
  const svc = new FilesystemService({ get: () => '/dl' } as never);
  const inner = join('/dl', 'Name$id', 'Name');

  it('joins a normal title under the manga folder', () => {
    expect(svc.chapterDir(inner, '第1话')).toBe(join(inner, '第1话'));
  });

  it.each([[''], ['.'], ['..'], [join('..', 'x')]])(
    'refuses %j, which is not a direct child of the manga folder',
    (title) => {
      expect(() => svc.chapterDir(inner, title)).toThrow(/Unsafe chapter folder/);
    },
  );
});
