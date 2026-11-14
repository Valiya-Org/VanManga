import axios, {
  isAxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';
import { ApiError } from './errors';
import type { ApiFailure, ApiSuccess } from './types';

/**
 * The single axios instance. Same-origin `/api` (contract §1.1); in dev the
 * Vite proxy forwards it to the backend.
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
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

http.interceptors.request.use((config) => {
  const token = adminTokenProvider?.();
  if (token) config.headers.set(ADMIN_TOKEN_HEADER, token);
  return config;
});

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
  if (isAxiosError(err)) {
    const res = err.response;
    if (!res) return new ApiError(0, 'network-error', err.message);
    if (isFailure(res.data)) {
      const body = res.data;
      return new ApiError(res.status, body.error, body.message, body.data);
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
