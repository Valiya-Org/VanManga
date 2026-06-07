import { http } from '@/api/http';
import type {
  ApiEnvelope,
  Chapter,
  DownloadSwitchData,
  Manga,
  MangaSearchResult,
} from '@/types/manga';

/** 在现有源中搜索漫画。 */
export async function searchManga(
  mangaName: string,
): Promise<ApiEnvelope<MangaSearchResult[]>> {
  const res = await http.get('dogemanga/search', {
    params: { manga_name: mangaName },
  });
  return res.data;
}

/**
 * 确认并提交一部漫画下载。
 * submit_sign: '0' 普通提交（可能触发 409 重复确认，data 为 {@link DuplicateCheckData}）；
 * '1' 强制添加；'2' 取消。
 */
export async function confirmSelection(
  mangaObject: MangaSearchResult,
  submitSign: '0' | '1' | '2',
): Promise<ApiEnvelope<unknown>> {
  const res = await http.post('dogemanga/confirm', {
    manga_object: mangaObject,
    submit_sign: submitSign,
  });
  return res.data;
}

/** 获取漫画库列表。 */
export async function fetchLibrary(): Promise<ApiEnvelope<Manga[]>> {
  const res = await http.post('dogemanga/lib');
  return res.data;
}

/** 获取当前正在下载的漫画 id。 */
export async function fetchCurrentDownload(): Promise<ApiEnvelope<number>> {
  const res = await http.get('dogemanga/cdl');
  return res.data;
}

/** 删除漫画。后端不校验口令，删除为非鉴权操作（与旧后端一致）。 */
export async function deleteManga(
  mangaId: number,
): Promise<ApiEnvelope<unknown>> {
  const res = await http.delete('dogemanga/deletemanga', {
    data: { manga_id: mangaId },
  });
  return res.data;
}

/** 切换漫画的自动更新检查开关。 */
export async function toggleDownloadSwitch(
  mangaId: number,
): Promise<ApiEnvelope<DownloadSwitchData>> {
  const res = await http.post('dogemanga/downloadswitch', {
    manga_id: mangaId,
  });
  return res.data;
}

/** 重新下载选中的章节。 */
export async function redownload(
  mangaId: number,
  selectedChapters: Chapter[],
): Promise<ApiEnvelope<unknown>> {
  const res = await http.post('dogemanga/redownload', {
    manga_id: mangaId,
    selected_array: JSON.stringify(selectedChapters),
  });
  return res.data;
}

/** 获取某漫画可重新下载的章节列表。 */
export async function fetchChapters(
  mangaId: number,
): Promise<ApiEnvelope<Chapter[]>> {
  const res = await http.get('dogemanga/confirmmanga', {
    params: { manga_id: mangaId },
  });
  return res.data;
}
