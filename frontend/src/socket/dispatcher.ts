import type { ServerToClientEvents } from '@/api/types';
import { useConfigStore } from '@/stores/config';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { useRealtimeStore } from '@/stores/realtime';

/** Socket.io lifecycle events the dispatcher listens to. */
export const LIFECYCLE_EVENTS = ['connect', 'connect_error', 'disconnect'] as const;

type EventName = keyof ServerToClientEvents | (typeof LIFECYCLE_EVENTS)[number];
type AnyHandler = (...args: never[]) => void;

/** The slice of a socket.io client the dispatcher needs. */
export interface SocketLike {
  on(event: EventName, handler: AnyHandler): unknown;
  off(event: EventName, handler: AnyHandler): unknown;
}

/**
 * Routes every canonical socket event (docs/api-contract.md §4) to store
 * actions. Components read the stores; nothing else listens to the socket.
 * Legacy event names are deliberately not handled.
 *
 * `connect` (first connect and every reconnect) reloads library and queue
 * so state missed while disconnected is recovered, and retries the config
 * if it failed to load. The initial load does not depend on the socket:
 * `useRealtime()` loads everything at startup. The first `connect` reloads
 * too (events between the startup snapshot and the connection would
 * otherwise be lost); overlapping loads are safe, the stores apply only the
 * latest one.
 *
 * `connect`, `disconnect` and `connect_error` update `useRealtimeStore()`.
 *
 * Returns an unbind function. Must be called with an active Pinia.
 */
export function bindSocketEvents(socket: SocketLike): () => void {
  const library = useLibraryStore();
  const queue = useQueueStore();
  const config = useConfigStore();
  const realtime = useRealtimeStore();

  const handlers: { [K in EventName]: AnyHandler } = {
    connect: () => {
      realtime.markConnected();
      void library.load();
      void queue.load();
      if (config.error && !config.loading) void config.load();
    },
    disconnect: (reason: string) => realtime.markDisconnected(reason),
    connect_error: (err: Error) => realtime.markConnectError(err),
    download_started: queue.applyStarted,
    download_progress: queue.applyProgress,
    chapter_completed: library.applyChapterCompleted,
    download_completed: ((e) => {
      library.applyDownloadCompleted(e);
      queue.applyCompleted(e);
    }) satisfies ServerToClientEvents['download_completed'],
    queue_updated: queue.applySnapshot,
    scan_completed: () => {
      queue.applyScanCompleted();
      void library.load();
    },
    dmca_alert: library.applyDmcaAlert,
  };

  const entries = Object.entries(handlers) as [EventName, AnyHandler][];
  for (const [event, handler] of entries) socket.on(event, handler);
  return () => {
    for (const [event, handler] of entries) socket.off(event, handler);
  };
}
