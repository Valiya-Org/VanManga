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

describe('useSocket', () => {
  beforeEach(() => {
    ioMock.mockClear();
    socketStub.connect.mockClear();
    socketStub.disconnect.mockClear();
  });

  it('creates a socket with autoConnect disabled', () => {
    useSocket();
    expect(ioMock).toHaveBeenCalledTimes(1);
    const options = ioMock.mock.calls[0][1] as { autoConnect: boolean };
    expect(options.autoConnect).toBe(false);
  });

  it('exposes connect and disconnect that delegate to the socket', () => {
    const { connect, disconnect } = useSocket();
    connect();
    expect(socketStub.connect).toHaveBeenCalledTimes(1);
    disconnect();
    expect(socketStub.disconnect).toHaveBeenCalledTimes(1);
  });

  it('on() registers an event handler', () => {
    const { on } = useSocket();
    const handler = vi.fn();
    on('download_progress', handler);
    expect(socketStub.on).toHaveBeenCalledWith('download_progress', handler);
  });
});
