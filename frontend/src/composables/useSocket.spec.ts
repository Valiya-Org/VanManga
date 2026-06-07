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
  socketStub.on.mockClear();
  socketStub.off.mockClear();
  socketStub.connect.mockClear();
  socketStub.disconnect.mockClear();
  socketStub.connected = false;
});

describe('useSocket', () => {
  it('returns the same shared socket instance across calls (singleton)', () => {
    expect(useSocket().socket).toBe(useSocket().socket);
  });

  it('creates the underlying socket exactly once, with autoConnect disabled', () => {
    useSocket();
    useSocket();
    // io is only ever invoked once for the whole module (the singleton).
    expect(ioMock).toHaveBeenCalledTimes(1);
    const options = ioMock.mock.calls[0][1] as { autoConnect: boolean };
    expect(options.autoConnect).toBe(false);
  });

  it('on()/off() delegate to the shared socket', () => {
    const { on, off } = useSocket();
    const handler = vi.fn();
    on('scan_completed', handler);
    expect(socketStub.on).toHaveBeenCalledWith('scan_completed', handler);
    off('scan_completed', handler);
    expect(socketStub.off).toHaveBeenCalledWith('scan_completed', handler);
  });

  it('reference-counts connect()/disconnect() across consumers', () => {
    const a = useSocket();
    const b = useSocket();

    a.connect();
    expect(socketStub.connect).toHaveBeenCalledTimes(1);

    socketStub.connected = true; // simulate the connection being established
    b.connect();
    expect(socketStub.connect).toHaveBeenCalledTimes(1); // no second dial

    a.disconnect();
    expect(socketStub.disconnect).not.toHaveBeenCalled(); // b still holds a ref

    b.disconnect();
    expect(socketStub.disconnect).toHaveBeenCalledTimes(1);
  });
});
