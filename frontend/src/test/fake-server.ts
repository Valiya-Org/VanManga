import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

/** A reply that the test settles later (to model slow or overlapping requests). */
export interface DeferredReply {
  /** Settles the held request with this response. */
  resolve(status: number, body: unknown): void;
  /** Settles the held request with a transport failure. */
  networkError(): void;
  /** Resolves once the request has actually reached the server. */
  readonly received: Promise<InternalAxiosRequestConfig>;
}

/**
 * Test double for the backend: swaps the axios *adapter* (the transport) so
 * the real instance, its interceptors and the api functions all run for real.
 */
export interface FakeServer {
  /** Default reply for every request (until changed). */
  reply(status: number, body: unknown): void;
  /** One-shot replies, consumed in order before the default. */
  replyOnce(status: number, body: unknown): void;
  /** One-shot reply held until the test settles it; queued like `replyOnce`. */
  replyDeferred(): DeferredReply;
  /** Default to a transport failure (no response). */
  networkError(): void;
  /** Every request seen, in order. */
  requests: InternalAxiosRequestConfig[];
  lastRequest(): InternalAxiosRequestConfig | undefined;
  /** Parsed JSON body of the last request. */
  lastBody(): unknown;
  restore(): void;
}

type Outcome = { status: number; body: unknown } | 'network-error';
type Reply = Outcome | { deferred: Promise<Outcome>; onReceive(c: InternalAxiosRequestConfig): void };

export function fakeServer(instance: AxiosInstance): FakeServer {
  const original = instance.defaults.adapter;
  const requests: InternalAxiosRequestConfig[] = [];
  const queue: Reply[] = [];
  let fallback: Reply = { status: 404, body: { code: 404, error: 'not-found' } };

  function settle(config: InternalAxiosRequestConfig, next: Outcome): AxiosResponse {
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
  }

  const adapter: AxiosAdapter = async (config) => {
    requests.push(config);
    const next = queue.shift() ?? fallback;
    if (typeof next === 'object' && 'deferred' in next) {
      next.onReceive(config);
      const signal = config.signal as AbortSignal | undefined;
      const aborted = new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new CanceledError(undefined, undefined, config)),
        );
      });
      return settle(config, await Promise.race([next.deferred, aborted]));
    }
    return settle(config, next);
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
    replyDeferred() {
      let settleWith!: (o: Outcome) => void;
      let onReceive!: (c: InternalAxiosRequestConfig) => void;
      const deferred = new Promise<Outcome>((r) => (settleWith = r));
      const received = new Promise<InternalAxiosRequestConfig>((r) => (onReceive = r));
      queue.push({ deferred, onReceive });
      return {
        resolve: (status, body) => settleWith({ status, body }),
        networkError: () => settleWith('network-error'),
        received,
      };
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
