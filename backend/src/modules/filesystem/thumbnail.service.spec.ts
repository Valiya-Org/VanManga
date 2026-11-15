import { ThumbnailService } from './thumbnail.service';

describe('ThumbnailService.getThumbnailPath', () => {
  const fsService = { exists: jest.fn(async () => true) };
  const svc = new ThumbnailService(
    { get: jest.fn(() => '/thumbs') } as never,
    fsService as never,
  );

  it('resolves <dir>/<id>.jpg', async () => {
    await expect(svc.getThumbnailPath('-x')).resolves.toMatch(/-x\.jpg$/);
  });

  it.each(['../secret', '../../etc/x', 'a/b'])(
    'refuses ids that leave the directory (%p)',
    async (id) => {
      await expect(svc.getThumbnailPath(id)).rejects.toThrow('Thumbnail not found');
    },
  );
});

describe('ThumbnailService.remove', () => {
  const make = () => {
    const fsService = { removeFile: jest.fn(async () => undefined) };
    const svc = new ThumbnailService({ get: jest.fn(() => '/thumbs') } as never, fsService as never);
    return { svc, fsService };
  };

  it('removes <dir>/<id>.jpg', async () => {
    const t = make();
    await t.svc.remove('-x');
    expect(t.fsService.removeFile).toHaveBeenCalledWith(expect.stringMatching(/-x\.jpg$/));
  });

  it('never touches files outside the directory', async () => {
    const t = make();
    await t.svc.remove('../secret');
    expect(t.fsService.removeFile).not.toHaveBeenCalled();
  });

  it('swallows removal errors (best effort)', async () => {
    const t = make();
    t.fsService.removeFile.mockRejectedValueOnce(new Error('EACCES'));
    await expect(t.svc.remove('-x')).resolves.toBeUndefined();
  });
});

describe('ThumbnailService.persistAndLink', () => {
  it('writes the cover and links it by relative path (no domain in the library file)', async () => {
    const fsService = {
      ensureDir: jest.fn(async () => undefined),
      writeFile: jest.fn(async () => undefined),
    };
    const config = { get: jest.fn(() => '/thumbs') };
    const svc = new ThumbnailService(config as never, fsService as never);

    const out = await svc.persistAndLink({ manga_id: '-x', thumbnail: 'QQ==' });

    expect(out.thumbnail).toBe('/api/library/-x/thumbnail');
    expect(fsService.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/-x\.jpg$/),
      Buffer.from('QQ==', 'base64'),
    );
  });
});
