import { describe, it, expect, vi, beforeEach } from 'vitest';

const ioMock = vi.fn();
const socketStub = {
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return socketStub;
  },
}));

import { useSocket } from './useSocket';

beforeEach(() => {
  socketStub.connect.mockClear();
  socketStub.disconnect.mockClear();
  socketStub.connected = false;
});

describe('useSocket', () => {
  it('returns the same shared socket instance across calls (singleton)', () => {
    expect(useSocket().socket).toBe(useSocket().socket);
  });

  it('creates the socket once, same-origin on /socket.io, autoConnect off', () => {
    useSocket();
    useSocket();
    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, options] = ioMock.mock.calls[0] as [string, { autoConnect: boolean; path: string }];
    expect(url).toBe('');
    expect(options.path).toBe('/socket.io');
    expect(options.autoConnect).toBe(false);
  });

  it('reference-counts connect()/disconnect() across consumers', () => {
    const a = useSocket();
    const b = useSocket();

    a.connect();
    expect(socketStub.connect).toHaveBeenCalledTimes(1);

    socketStub.connected = true;
    b.connect();
    expect(socketStub.connect).toHaveBeenCalledTimes(1);

    a.disconnect();
    expect(socketStub.disconnect).not.toHaveBeenCalled();

    b.disconnect();
    expect(socketStub.disconnect).toHaveBeenCalledTimes(1);
  });
});
