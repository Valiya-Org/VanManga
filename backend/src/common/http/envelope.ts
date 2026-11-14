/** Canonical success envelope (docs/api-contract.md §1.2). Failures are
 *  thrown as ApiException and rendered by AllExceptionsFilter. */
export interface ApiSuccess<T> {
  code: 200;
  data: T;
}

export function ok<T>(data: T): ApiSuccess<T> {
  return { code: 200, data };
}
