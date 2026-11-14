import type { Server } from 'socket.io';
import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let emit: jest.Mock;

  beforeEach(() => {
    gateway = new EventsGateway();
    emit = jest.fn();
    gateway.server = { emit } as unknown as Server;
  });

  describe('legacy events (unchanged until P4)', () => {
    it('emits downloading_info as a BARE manga_id string', () => {
      gateway.emitDownloading('m1');
      expect(emit).toHaveBeenCalledWith('downloading_info', 'm1');
    });

    it('emits response with { manga_id, last_epi_name, last_epi }', () => {
      gateway.emitResponse({ manga_id: 'm1', last_epi_name: 'Chapter 5', last_epi: 5 });
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
