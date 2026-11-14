import type { Response } from 'express';
import type { ThumbnailService } from '../filesystem/thumbnail.service';

/** Stream a stored cover, or answer 404 with `notFoundBody`. */
export async function sendThumbnail(
  thumbnails: ThumbnailService,
  mangaId: string,
  res: Response,
  notFoundBody: unknown,
): Promise<void> {
  const notFound = () => {
    if (!res.headersSent) res.status(404).json(notFoundBody);
  };
  let path: string;
  try {
    path = await thumbnails.getThumbnailPath(mangaId);
  } catch {
    notFound();
    return;
  }
  // The path is built server-side from a validated id; allow dot-folders
  // in it (e.g. a data dir under ~/.vanmanga), which `send` rejects by default.
  res.sendFile(path, { dotfiles: 'allow' }, (err) => {
    if (err) notFound();
  });
}
