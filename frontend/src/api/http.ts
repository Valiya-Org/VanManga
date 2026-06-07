import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
} from 'axios';

/**
 * Shared axios instance. All API modules import this.
 * baseURL '/api' matches the NestJS global prefix; in dev the Vite
 * proxy forwards /api to the backend.
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

/** A backend `{ code, data }` envelope. */
interface Envelope {
  code: number;
  data?: unknown;
}

/**
 * Most legacy `/dogemanga/*` routes return HTTP 200 with a `{ code, data }`
 * body, but a few paths `throw` a NestJS HttpException for a non-200 semantic
 * code (e.g. 434 "manga is downloading, can't delete"). The global
 * AllExceptionsFilter then serves those as a non-2xx status with the real
 * envelope nested under `message`. axios rejects non-2xx responses, so without
 * this the caller's `res.code` branching is bypassed entirely.
 *
 * Returns the unwrapped envelope when `body.message` is itself a `{ code }`
 * envelope; otherwise `null` (a genuine error that should keep rejecting).
 */
function extractEnvelope(body: unknown): Envelope | null {
  if (body === null || typeof body !== 'object' || !('message' in body)) {
    return null;
  }
  const message = (body as { message: unknown }).message;
  if (
    message !== null &&
    typeof message === 'object' &&
    typeof (message as { code?: unknown }).code === 'number'
  ) {
    return message as Envelope;
  }
  return null;
}

/**
 * Response-interceptor error handler. Unwraps a thrown `{ code, data }`
 * envelope (see {@link extractEnvelope}) back into a resolved response so
 * callers keep reading `res.code`/`res.data`. Genuine errors are re-rejected.
 */
export function unwrapEnvelopeError(error: AxiosError): Promise<AxiosResponse> {
  const envelope = extractEnvelope(error.response?.data);
  if (envelope && error.response) {
    return Promise.resolve({ ...error.response, data: envelope });
  }
  return Promise.reject(error);
}

http.interceptors.response.use((response) => response, unwrapEnvelopeError);
