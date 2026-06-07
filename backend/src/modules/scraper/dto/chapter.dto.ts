/** A single chapter entry — output of getChapters / generate_chapters_array. */
export interface ChapterDto {
  /** Sequential index used to order chapters. */
  index: number;
  /** Display title (e.g. "第 12 話"). Already normalised for filesystem use. */
  title: string;
  /** Direct URL to the chapter page on the source site. */
  url: string;
}

export interface ChapterListResultDto {
  chapters: ChapterDto[];
  errorCode?: 501 | 503 | 504;
}
