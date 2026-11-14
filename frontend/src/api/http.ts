import axios, {
  isAxiosError,
  isCancel,
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';
import { ApiError } from './errors';
import { CANCELED_ERROR_CODE, type ApiFailure, type ApiSuccess } from './types';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Admin-protected route (🔒): attach `X-Admin-Token` when one is held. */
    adminProtected?: boolean;
  }
}

/**
 * Per-request timeout. Generous because search and chapter lists scrape the
 * source live (possibly through a Cloudflare solver); a hung backend then
 * yields `network-error` instead of a request that never settles.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Non-envelope statuses that mean "no backend reachable" (proxy errors). */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * The single axios instance. Same-origin `/api` (contract §1.1); in dev the
 * Vite proxy forwards it to the backend. Same-origin, so no
 * `withCredentials`.
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: REQUEST_TIMEOUT_MS,
});

export const ADMIN_TOKEN_HEADER = 'X-Admin-Token';

type AdminTokenProvider = () => string | null | undefined;
let adminTokenProvider: AdminTokenProvider | null = null;

/**
 * Registers where the admin token comes from. The session store calls this;
 * keeping it a callback keeps this module free of Pinia. Pass `null` to clear.
 */
export function setAdminTokenProvider(provider: AdminTokenProvider | null): void {
  adminTokenProvider = provider;
}

// Synchronous so the token is read when the request is issued: withAdmin
// compares it with the token held when the attempt started.
http.interceptors.request.use(
  (config) => {
    if (!config.adminProtected) return config;
    const token = adminTokenProvider?.();
    if (token) config.headers.set(ADMIN_TOKEN_HEADER, token);
    return config;
  },
  undefined,
  { synchronous: true },
);

function isEnvelope(body: unknown): body is { code: number } {
  return (
    body !== null &&
    typeof body === 'object' &&
    typeof (body as { code?: unknown }).code === 'number'
  );
}

function isFailure(body: unknown): body is ApiFailure {
  return isEnvelope(body) && typeof (body as { error?: unknown }).error === 'string';
}

/** Converts anything axios throws into an {@link ApiError}. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (isCancel(err)) {
    return new ApiError(0, CANCELED_ERROR_CODE, (err as Error).message || 'canceled');
  }
  if (isAxiosError(err)) {
    const res = err.response;
    if (!res) return new ApiError(0, 'network-error', err.message);
    if (isFailure(res.data)) {
      const body = res.data;
      return new ApiError(res.status, body.error, body.message, body.data);
    }
    if (GATEWAY_STATUSES.has(res.status)) {
      return new ApiError(res.status, 'network-error', err.message);
    }
    return new ApiError(res.status, `http-${res.status}`, err.message);
  }
  return new ApiError(0, 'network-error', err instanceof Error ? err.message : String(err));
}

/**
 * Performs a request and returns the envelope's `data`; rejects with
 * {@link ApiError} on any failure. All api functions go through this.
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  let body: unknown;
  try {
    body = (await http.request<unknown>(config)).data;
  } catch (err) {
    throw toApiError(err);
  }
  if (!isEnvelope(body) || !('data' in body)) {
    throw new ApiError(200, 'invalid-response', 'Response is not an API envelope');
  }
  return (body as ApiSuccess<T>).data;
}
