import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents } from '@/api/types';

/** Typed client socket: the server only emits; the client sends nothing. */
export type AppSocket = Socket<ServerToClientEvents, Record<string, never>>;

/**
 * Wraps a SINGLE shared socket.io-client connection to the backend default
 * namespace, same-origin (`/socket.io`; Vite proxies it in dev). autoConnect
 * is off so the app root decides when to connect.
 *
 * Module-level singleton; connect()/disconnect() are reference-counted so the
 * connection closes only when the last consumer disconnects.
 *
 * Components should not listen to it directly — `useRealtime()` at the app
 * root binds it to the stores (see `@/socket/dispatcher`).
 */
let socket: AppSocket | null = null;
let connectionCount = 0;

function getSocket(): AppSocket {
  if (!socket) {
    socket = io('', {
      path: '/socket.io',
      autoConnect: false,
    });
  }
  return socket;
}

export function useSocket() {
  const instance = getSocket();

  function connect(): void {
    connectionCount += 1;
    if (!instance.connected) {
      instance.connect();
    }
  }

  function disconnect(): void {
    connectionCount = Math.max(0, connectionCount - 1);
    if (connectionCount === 0) {
      instance.disconnect();
    }
  }

  return { socket: instance, connect, disconnect };
}
