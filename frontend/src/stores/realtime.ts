import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * State of the realtime (socket.io) connection, written by the socket
 * dispatcher. Data still loads over HTTP when this is offline; only live
 * updates stop.
 */
export const useRealtimeStore = defineStore('realtime', () => {
  /** The socket is currently connected. */
  const connected = ref(false);
  /** The socket has connected at least once in this page session. */
  const everConnected = ref(false);
  /** English debugging text of the last `connect_error`; not for users. */
  const realtimeError = ref<string | null>(null);
  /** Reason of the last `disconnect` (socket.io reason string). */
  const disconnectReason = ref<string | null>(null);

  /**
   * Show a "realtime offline" indicator: not connected after having been
   * connected, or a connection attempt failed. False while the very first
   * connection attempt is still pending.
   */
  const offline = computed(
    () => !connected.value && (everConnected.value || realtimeError.value !== null),
  );

  function markConnected(): void {
    connected.value = true;
    everConnected.value = true;
    realtimeError.value = null;
    disconnectReason.value = null;
  }

  function markDisconnected(reason: string): void {
    connected.value = false;
    disconnectReason.value = reason;
  }

  function markConnectError(err: unknown): void {
    connected.value = false;
    realtimeError.value = err instanceof Error ? err.message : String(err);
  }

  return {
    connected,
    everConnected,
    realtimeError,
    disconnectReason,
    offline,
    markConnected,
    markDisconnected,
    markConnectError,
  };
});
