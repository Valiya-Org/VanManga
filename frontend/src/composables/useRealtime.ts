import { onScopeDispose } from 'vue';
import { bindSocketEvents } from '@/socket/dispatcher';
import { useConfigStore } from '@/stores/config';
import { useSocket } from './useSocket';

/**
 * Call once in the root component's setup. Loads the runtime config,
 * connects the shared socket and binds every event to the stores; the
 * socket's `connect` event (re)loads library and queue. Torn down when the
 * calling scope is disposed.
 */
export function useRealtime(): void {
  void useConfigStore().load();
  const { socket, connect, disconnect } = useSocket();
  const unbind = bindSocketEvents(socket);
  connect();
  onScopeDispose(() => {
    unbind();
    disconnect();
  });
}
