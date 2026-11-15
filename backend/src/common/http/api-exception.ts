import { HttpException, NotFoundException } from '@nestjs/common';

/** Canonical-API failure: the global filter turns it into
 *  `{ code: status, error, message?, data? }` (see docs/api-contract.md). */
export class ApiException extends HttpException {
  readonly errorCode: string;
  readonly data: unknown;

  constructor(
    status: number,
    error: string,
    options: { message?: string; data?: unknown } = {},
  ) {
    super(options.message ?? error, status);
    this.errorCode = error;
    this.data = options.data;
  }
}

/** Thrown by shared services; the global filter reads `errorCode`. */
export class MangaNotFoundException extends NotFoundException {
  readonly errorCode = 'manga-not-found';

  constructor(mangaId: string) {
    super(`Unknown manga: ${mangaId}`);
  }
}

export class UnknownSourceException extends NotFoundException {
  readonly errorCode = 'unknown-source';

  constructor(name: string, registered: string[]) {
    super(`Unknown manga source: '${name}'. Registered: ${registered.join(', ')}`);
  }
}

/** The machine-readable error of an exception, if it declares one. */
export function errorCodeOf(exception: unknown): string | undefined {
  if (exception === null || typeof exception !== 'object') return undefined;
  const code = (exception as { errorCode?: unknown }).errorCode;
  return typeof code === 'string' ? code : undefined;
}
