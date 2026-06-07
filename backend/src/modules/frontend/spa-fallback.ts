import { extname, join } from 'path';
import type { Request, Response, NextFunction } from 'express';
import { STATIC_ROOT } from './frontend.module';

/**
 * Express middleware: serve the SPA index.html for client-side routes only.
 *
 * Gated to extension-less GET paths that are not API or websocket routes.
 * This ensures real backend routes (e.g. /js/config.js) and hashed static
 * assets (e.g. /assets/index-abc.js) fall through to their own handlers
 * instead of being shadowed by index.html. Because the gate excludes any
 * path with a file extension, the middleware can be registered before Nest
 * routes without intercepting them.
 */
export function spaFallback(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    req.method === 'GET' &&
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
