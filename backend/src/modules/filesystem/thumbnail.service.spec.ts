import { ThumbnailService } from './thumbnail.service';

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
