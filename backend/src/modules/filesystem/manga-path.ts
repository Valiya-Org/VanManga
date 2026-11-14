/**
 * Directory names for a manga on disk.
 *
 * Layout: {downloadRoot}/{name}${id}/{name}/{chapter}.zip
 *
 * A manga name may contain `/` (e.g. "Fate / Strange Fake"), which would
 * otherwise create nested directories. The legacy scraper replaced it with
 * `-` (modules/DGmanga.py); every place that builds one of these paths must
 * go through here so download, delete and the Kavita scan agree.
 */
export function mangaDirName(mangaName: string): string {
  return mangaName.replace(/\//g, '-');
}

/** Top-level folder of a manga: `{name}${id}`. */
export function mangaFolderName(mangaName: string, mangaId: string): string {
  return `${mangaDirName(mangaName)}$${mangaId}`;
}
