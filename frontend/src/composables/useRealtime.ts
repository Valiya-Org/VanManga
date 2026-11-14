import { onScopeDispose } from 'vue';
import { bindSocketEvents } from '@/socket/dispatcher';
import { useConfigStore } from '@/stores/config';
import { useLibraryStore } from '@/stores/library';
import { useQueueStore } from '@/stores/queue';
import { useSessionStore } from '@/stores/session';
import { useSocket } from './useSocket';

/**
 * Call once in the root component's setup. Loads config, library and queue
 * over HTTP right away (independent of the socket), then connects the shared
 * socket and binds every event to the stores; each socket `connect`
 * (including reconnects) reloads library and queue. Connection state is in
 * `useRealtimeStore()`. Torn down when the calling scope is disposed.
 */
export function useRealtime(): void {
  // Instantiated eagerly so its config watch (Kavita cleanup) is active.
  useSessionStore();
  void useConfigStore().load();
  void useLibraryStore().load();
  void useQueueStore().load();

  const { socket, connect, disconnect } = useSocket();
  const unbind = bindSocketEvents(socket);
  connect();
  onScopeDispose(() => {
    unbind();
    disconnect();
  });
}
