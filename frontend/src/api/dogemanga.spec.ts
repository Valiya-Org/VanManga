import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { http } from '@/api/http';
import {
  searchManga,
  confirmSelection,
  fetchLibrary,
  fetchCurrentDownload,
  deleteManga,
  toggleDownloadSwitch,
  redownload,
  fetchChapters,
} from './dogemanga';

const mockGet = http.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = http.post as unknown as ReturnType<typeof vi.fn>;
const mockDelete = http.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
});

describe('dogemanga api', () => {
  it('searchManga GETs /search with manga_name param and returns envelope', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: [{ manga_id: 1 }] } });
    const res = await searchManga('naruto');
    expect(mockGet).toHaveBeenCalledWith('dogemanga/search', {
      params: { manga_name: 'naruto' },
    });
    expect(res).toEqual({ code: 200, data: [{ manga_id: 1 }] });
  });

  it('confirmSelection POSTs /confirm with manga_object and submit_sign', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: null } });
    const manga = { manga_id: 1 } as never;
    await confirmSelection(manga, '0');
    expect(mockPost).toHaveBeenCalledWith('dogemanga/confirm', {
      manga_object: manga,
      submit_sign: '0',
    });
  });

  it('fetchLibrary POSTs /lib', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: [] } });
    await fetchLibrary();
    expect(mockPost).toHaveBeenCalledWith('dogemanga/lib');
  });

  it('fetchCurrentDownload GETs /cdl', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: 7 } });
    const res = await fetchCurrentDownload();
    expect(mockGet).toHaveBeenCalledWith('dogemanga/cdl');
    expect(res.data).toBe(7);
  });

  it('deleteManga DELETEs /deletemanga with body in config.data', async () => {
    mockDelete.mockResolvedValue({ data: { code: 200, data: null } });
    await deleteManga(3, 'SECRETCODE0000001');
    expect(mockDelete).toHaveBeenCalledWith('dogemanga/deletemanga', {
      data: { manga_id: 3, pwd: 'SECRETCODE0000001' },
    });
  });

  it('toggleDownloadSwitch POSTs /downloadswitch with manga_id', async () => {
    mockPost.mockResolvedValue({
      data: { code: 200, data: { currentDownloadStatus: 1 } },
    });
    const res = await toggleDownloadSwitch(5);
    expect(mockPost).toHaveBeenCalledWith('dogemanga/downloadswitch', {
      manga_id: 5,
    });
    expect(res.data.currentDownloadStatus).toBe(1);
  });

  it('redownload POSTs /redownload with selected_array JSON-stringified', async () => {
    mockPost.mockResolvedValue({ data: { code: 200, data: null } });
    const chapters = [{ chapter_title: 'c1', chapter_link: 'l1' }];
    await redownload(9, chapters);
    expect(mockPost).toHaveBeenCalledWith('dogemanga/redownload', {
      manga_id: 9,
      selected_array: JSON.stringify(chapters),
    });
  });

  it('fetchChapters GETs /confirmmanga with manga_id param', async () => {
    mockGet.mockResolvedValue({ data: { code: 200, data: [] } });
    await fetchChapters(4);
    expect(mockGet).toHaveBeenCalledWith('dogemanga/confirmmanga', {
      params: { manga_id: 4 },
    });
  });
});
