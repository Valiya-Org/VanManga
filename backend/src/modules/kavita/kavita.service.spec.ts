import { of, throwError } from 'rxjs';
import { KavitaService } from './kavita.service';

const cfg: Record<string, unknown> = {
  'kavita.enabled': true,
  'kavita.baseUrl': 'http://kavita:5000',
  'kavita.exposeUrl': 'https://kavita.example.com',
  'kavita.adminApiKey': 'ADMINKEY',
  'kavita.libId': 3,
};

function setup(series: Array<{ id: number; folderPath: string }>, known: string[]) {
  const post = jest.fn((url: string) => {
    if (url.includes('/api/Plugin/authenticate')) return of({ data: { token: 'JWT' } });
    if (url.endsWith('/api/Series/all-v2')) return of({ data: series });
    if (url.endsWith('/api/Library/scan-folder')) return of({ status: 200, data: {} });
    return throwError(() => new Error(`unexpected ${url}`));
  });
  const repo = {
    has: jest.fn((id: string) => known.includes(id)),
    update: jest.fn(async () => undefined),
  };
  const svc = new KavitaService(
    { post } as never,
    { get: (k: string) => cfg[k] } as never,
    repo as never,
  );
  return { svc, post, repo };
}

describe('KavitaService.syncLibrary', () => {
  it('maps "<name>$<id>" series folders back to library manga and stores the series URL', async () => {
    const t = setup(
      [
        { id: 11, folderPath: '/manga/A・S・Gグループフタコマ漫画劇場$E8uHNgs8' },
        { id: 12, folderPath: '/manga/not-ours' }, // no $ → not a VanManga folder
        { id: 13, folderPath: '/manga/Other$unknownId' }, // not in library
      ],
      ['E8uHNgs8'],
    );

    await expect(t.svc.syncLibrary()).resolves.toBe(1);
    expect(t.repo.update).toHaveBeenCalledTimes(1);
    expect(t.repo.update).toHaveBeenCalledWith('E8uHNgs8', {
      kavita_url: 'https://kavita.example.com/library/3/series/11',
    });
    // series listing is authenticated with the plugin JWT
    expect(t.post).toHaveBeenCalledWith(
      'http://kavita:5000/api/Series/all-v2',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer JWT' }),
      }),
    );
  });

  it('returns 0 and writes nothing when authentication fails', async () => {
    const t = setup([], []);
    t.post.mockImplementationOnce(() => throwError(() => new Error('401')));
    await expect(t.svc.syncLibrary()).resolves.toBe(0);
    expect(t.repo.update).not.toHaveBeenCalled();
  });

  it('does nothing when Kavita is not configured', async () => {
    const t = setup([], []);
    cfg['kavita.enabled'] = false;
    try {
      await expect(t.svc.syncLibrary()).resolves.toBe(0);
      expect(t.post).not.toHaveBeenCalled();
    } finally {
      cfg['kavita.enabled'] = true;
    }
  });
});

describe('KavitaService.scanFolder', () => {
  it('asks Kavita to scan /manga/<name>$<id> after a download', async () => {
    const t = setup([], []);
    await t.svc.handleDownloadCompleted({ mangaId: 'E8uHNgs8', mangaName: 'Name' });
    expect(t.post).toHaveBeenCalledWith(
      'http://kavita:5000/api/Library/scan-folder',
      { apiKey: 'ADMINKEY', folderPath: '/manga/Name$E8uHNgs8' },
      expect.anything(),
    );
  });

  it('a failed scan does not throw out of the download-completed handler', async () => {
    const t = setup([], []);
    t.post.mockImplementation((url: string) =>
      url.includes('authenticate')
        ? of({ data: { token: 'JWT' } })
        : throwError(() => new Error('ECONNREFUSED')),
    );
    await expect(
      t.svc.handleDownloadCompleted({ mangaId: 'x', mangaName: 'y' }),
    ).resolves.toBeUndefined();
  });
});
