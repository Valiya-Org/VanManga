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
