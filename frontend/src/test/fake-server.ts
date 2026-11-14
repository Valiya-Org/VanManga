import {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

/**
 * Test double for the backend: swaps the axios *adapter* (the transport) so
 * the real instance, its interceptors and the api functions all run for real.
 */
export interface FakeServer {
  /** Default reply for every request (until changed). */
  reply(status: number, body: unknown): void;
  /** One-shot replies, consumed in order before the default. */
  replyOnce(status: number, body: unknown): void;
  /** Default to a transport failure (no response). */
  networkError(): void;
  /** Every request seen, in order. */
  requests: InternalAxiosRequestConfig[];
  lastRequest(): InternalAxiosRequestConfig | undefined;
  /** Parsed JSON body of the last request. */
  lastBody(): unknown;
  restore(): void;
}

type Reply = { status: number; body: unknown } | 'network-error';

export function fakeServer(instance: AxiosInstance): FakeServer {
  const original = instance.defaults.adapter;
  const requests: InternalAxiosRequestConfig[] = [];
  const queue: Reply[] = [];
  let fallback: Reply = { status: 404, body: { code: 404, error: 'not-found' } };

  const adapter: AxiosAdapter = async (config) => {
    requests.push(config);
    const next = queue.shift() ?? fallback;
    if (next === 'network-error') {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});
    }
    const response: AxiosResponse = {
      data: next.body,
      status: next.status,
      statusText: String(next.status),
      headers: {},
      config,
    };
    if (next.status >= 200 && next.status < 300) return response;
    throw new AxiosError(
      `Request failed with status code ${next.status}`,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      {},
      response,
    );
  };
  instance.defaults.adapter = adapter;

  return {
    requests,
    reply(status, body) {
      fallback = { status, body };
    },
    replyOnce(status, body) {
      queue.push({ status, body });
    },
    networkError() {
      fallback = 'network-error';
    },
    lastRequest: () => requests.at(-1),
    lastBody() {
      const data = requests.at(-1)?.data;
      return typeof data === 'string' ? JSON.parse(data) : data;
    },
    restore() {
      instance.defaults.adapter = original;
    },
  };
}
