import { io, type Socket } from 'socket.io-client';

/**
 * Wraps a socket.io-client connection to the backend default namespace.
 * In dev, Vite proxies /socket.io to NestJS; in prod they share an origin,
 * so the empty URL (current origin) is correct. autoConnect is off so
 * callers control when the connection opens.
 */
export function useSocket() {
  const socket: Socket = io('', {
    path: '/socket.io',
    autoConnect: false,
    withCredentials: true,
  });

  function connect(): void {
    socket.connect();
  }

  function disconnect(): void {
    socket.disconnect();
  }

  function on(event: string, handler: (...args: unknown[]) => void): void {
    socket.on(event, handler);
  }

  function off(event: string, handler?: (...args: unknown[]) => void): void {
    socket.off(event, handler);
  }

  return { socket, connect, disconnect, on, off };
}
