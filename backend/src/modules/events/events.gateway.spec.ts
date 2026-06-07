import { EventsGateway } from './events.gateway';
import type { Server } from 'socket.io';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let emit: jest.Mock;

  beforeEach(() => {
    gateway = new EventsGateway();
    emit = jest.fn();
    gateway.server = { emit } as unknown as Server;
  });

  it('emits downloading_info as a BARE manga_id string', () => {
    gateway.emitDownloading('m1');
    expect(emit).toHaveBeenCalledWith('downloading_info', 'm1');
  });

  it('emits response with { manga_id, last_epi_name, last_epi }', () => {
    gateway.emitResponse({
      manga_id: 'm1',
      last_epi_name: 'Chapter 5',
      last_epi: 5,
    });
    expect(emit).toHaveBeenCalledWith('response', {
      manga_id: 'm1',
      last_epi_name: 'Chapter 5',
      last_epi: 5,
    });
  });

  it('emits complete_info with { manga_id }', () => {
    gateway.emitComplete({ manga_id: 'm1' });
    expect(emit).toHaveBeenCalledWith('complete_info', { manga_id: 'm1' });
  });

  it('emits scan_completed with no payload', () => {
    gateway.emitScanCompleted();
    expect(emit).toHaveBeenCalledWith('scan_completed');
  });
});
