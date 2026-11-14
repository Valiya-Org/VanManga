import type { AnyErrorCode } from './types';

/**
 * The one error type every api function rejects with.
 *
 * - `status`: HTTP status; `0` when no response arrived (network error).
 * - `error`: machine-readable code from the envelope (docs/api-contract.md
 *   §1.3), or a client code (`network-error`, `invalid-response`,
 *   `http-<status>` for a non-envelope body). Branch on this, never on
 *   `message`.
 * - `message`: English debugging text from the server (not for users; use
 *   `errorMessage()` from `@/errors/messages` for UI text).
 * - `data`: extra payload on a few errors (`duplicate`, `already-in-library`).
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly error: AnyErrorCode,
    message?: string,
    readonly data?: unknown,
  ) {
    super(message ?? error);
  }

  /** 401 from an admin-protected route (contract §1.4). */
  get isAdminTokenError(): boolean {
    return this.error === 'admin-token-required' || this.error === 'admin-token-invalid';
  }

  /** 410 on add: the search cache dropped the candidate; search again. */
  get isSearchExpired(): boolean {
    return this.error === 'search-expired';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
