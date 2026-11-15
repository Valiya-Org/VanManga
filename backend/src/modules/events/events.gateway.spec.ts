import type { Server } from 'socket.io';
import { EventsGateway } from './events.gateway';
import { SOCKET_EVENTS } from './events.types';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let emit: jest.Mock;

  beforeEach(() => {
    gateway = new EventsGateway();
    emit = jest.fn();
    gateway.server = { emit } as unknown as Server;
  });

  it('knows exactly the seven canonical event names', () => {
    expect(Object.values(SOCKET_EVENTS).sort()).toEqual([
      'chapter_completed',
      'dmca_alert',
      'download_completed',
      'download_progress',
      'download_started',
      'queue_updated',
      'scan_completed',
    ]);
  });

  describe('canonical events', () => {
    it('download_started', () => {
      gateway.emitDownloadStarted({ manga_id: 'm1', kind: 'full-manga' });
      expect(emit).toHaveBeenCalledWith('download_started', { manga_id: 'm1', kind: 'full-manga' });
    });

    it('download_progress', () => {
      const p = { manga_id: 'm1', chapters_total: 3, chapters_done: 1, chapters_failed: 0 };
      gateway.emitDownloadProgress(p);
      expect(emit).toHaveBeenCalledWith('download_progress', p);
    });

    it('chapter_completed', () => {
      const p = {
        manga_id: 'm1',
        chapter_index: 2,
        chapter_title: '第2话',
        last_epi: 2,
        last_epi_name: '第2话',
        updated_at: 1,
      };
      gateway.emitChapterCompleted(p);
      expect(emit).toHaveBeenCalledWith('chapter_completed', p);
    });

    it('download_completed', () => {
      const p = {
        manga_id: 'm1',
        kind: 'redownload' as const,
        status: 'done' as const,
        chapters_total: 1,
        chapters_failed: 0,
        manga: null,
      };
      gateway.emitDownloadCompleted(p);
      expect(emit).toHaveBeenCalledWith('download_completed', p);
    });

    it('relays QUEUE_CHANGED as queue_updated', () => {
      const snapshot = { active: null, pending: [] };
      gateway.handleQueueChanged(snapshot);
      expect(emit).toHaveBeenCalledWith('queue_updated', snapshot);
    });

    it('scan_completed has no payload', () => {
      gateway.emitScanCompleted();
      expect(emit).toHaveBeenCalledWith('scan_completed');
    });

    it('dmca_alert', () => {
      gateway.emitDmcaAlert({ manga_id: 'm1', manga_name: 'n' });
      expect(emit).toHaveBeenCalledWith('dmca_alert', { manga_id: 'm1', manga_name: 'n' });
    });

    it('does not throw before the server is attached', () => {
      const bare = new EventsGateway();
      expect(() => bare.handleQueueChanged({ active: null, pending: [] })).not.toThrow();
    });
  });
});
