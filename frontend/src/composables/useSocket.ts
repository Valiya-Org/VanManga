import { io, type Socket } from 'socket.io-client';

/**
 * Wraps a SINGLE shared socket.io-client connection to the backend default
 * namespace. In dev, Vite proxies /socket.io to NestJS; in prod they share an
 * origin, so the empty URL (current origin) is correct. autoConnect is off so
 * callers control when the connection opens.
 *
 * The socket is a module-level singleton: every `useSocket()` call returns the
 * same connection, so multiple consumers (e.g. MainPage + MangaKu) don't open
 * parallel sockets that each receive only some events. connect()/disconnect()
 * are reference-counted, so a component unmounting only tears the connection
 * down once the last consumer has disconnected.
 */
let socket: Socket | null = null;
let connectionCount = 0;

function getSocket(): Socket {
  if (!socket) {
    socket = io('', {
      path: '/socket.io',
      autoConnect: false,
      withCredentials: true,
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

  function on(event: string, handler: (...args: unknown[]) => void): void {
    instance.on(event, handler);
  }

  function off(event: string, handler?: (...args: unknown[]) => void): void {
    instance.off(event, handler);
  }

  return { socket: instance, connect, disconnect, on, off };
}
