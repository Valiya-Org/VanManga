/** 后端统一返回信封：{ code, data }。调用方按 code 分支。 */
export interface ApiEnvelope<T = unknown> {
  code: number;
  data: T;
}

/** 搜索结果项（dogemanga/search 返回，thumbnail 为 base64 原文）。 */
export interface MangaSearchResult {
  manga_id: number;
  manga_name: string;
  artist_name: string;
  thumbnail: string;
  newest_epi: string;
}

/** 漫画库项（dogemanga/lib 返回）。completed 为前端瞬时 UI 标记。 */
export interface Manga {
  manga_id: number;
  manga_name: string;
  artist_name: string;
  thumbnail: string;
  last_epi_name: string;
  last_epi: number | string;
  serialization: number; // 0 = 未完结，其他 = 已完结
  download_switch: number; // 0 = 更新检查开启
  add_date: number; // unix 秒
  kavita_url: string;
  completed?: number | boolean; // 前端瞬时标记，非后端字段
}

/** 章节项（dogemanga/confirmmanga 返回）。 */
export interface Chapter {
  chapter_title: string;
  chapter_link: string;
}

/** downloadswitch 成功返回的 data。 */
export interface DownloadSwitchData {
  currentDownloadStatus: number;
}

/** kavita/login 成功返回的 data。 */
export interface KavitaLoginData {
  apiKey: string;
}
