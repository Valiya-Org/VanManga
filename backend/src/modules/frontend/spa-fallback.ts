import { extname, join } from 'path';
import type { Request, Response, NextFunction } from 'express';
import { STATIC_ROOT } from './frontend.module';

/**
 * Express middleware: serve the SPA index.html for client-side routes only.
 *
 * Gated to extension-less GET/HEAD paths that are not API or websocket
 * routes. Any path with a file extension (e.g. /assets/index-abc.js,
 * /js/config.js) is left to the static middleware and, when no such file
 * exists, to Nest's 404 — never answered with index.html. Because of the
 * gate, the middleware can be registered before Nest routes without
 * intercepting them.
 */
export function spaFallback(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    (req.method === 'GET' || req.method === 'HEAD') &&
    !req.path.startsWith('/api/') &&
    !req.path.startsWith('/socket.io') &&
    !extname(req.path)
  ) {
    res.sendFile(join(STATIC_ROOT, 'index.html'), (err) => {
      if (err) next();
    });
  } else {
    next();
  }
}
