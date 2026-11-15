import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { QUEUE_CHANGED } from '../../common/events/app.events';
import type { QueueSnapshot } from '../download/queue/task.types';
import {
  ChapterCompletedPayload,
  DmcaAlertPayload,
  DownloadCompletedPayload,
  DownloadProgressPayload,
  DownloadStartedPayload,
  SOCKET_EVENTS,
} from './events.types';

/** Server → client broadcasts (docs/api-contract.md §4). Clients never
 *  send events. */
@WebSocketGateway({
  // No `cors` here: same-origin by default; CORS_ORIGINS opts in through
  // CorsIoAdapter (app.setup.ts).
  transports: ['websocket', 'polling'],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit(): void {
    this.logger.log('Socket.IO gateway initialised');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`client disconnected: ${client.id}`);
  }

  emitDownloadStarted(payload: DownloadStartedPayload): void {
    this.emit(SOCKET_EVENTS.DOWNLOAD_STARTED, payload);
  }

  emitDownloadProgress(payload: DownloadProgressPayload): void {
    this.emit(SOCKET_EVENTS.DOWNLOAD_PROGRESS, payload);
  }

  emitChapterCompleted(payload: ChapterCompletedPayload): void {
    this.emit(SOCKET_EVENTS.CHAPTER_COMPLETED, payload);
  }

  emitDownloadCompleted(payload: DownloadCompletedPayload): void {
    this.emit(SOCKET_EVENTS.DOWNLOAD_COMPLETED, payload);
  }

  @OnEvent(QUEUE_CHANGED)
  handleQueueChanged(snapshot: QueueSnapshot): void {
    this.emit(SOCKET_EVENTS.QUEUE_UPDATED, snapshot);
  }

  /** 'scan_completed' — a rezip task finished. No payload. */
  emitScanCompleted(): void {
    this.emit(SOCKET_EVENTS.SCAN_COMPLETED);
  }

  emitDmcaAlert(payload: DmcaAlertPayload): void {
    this.emit(SOCKET_EVENTS.DMCA_ALERT, payload);
  }

  /** The queue can change during module init, before the server exists. */
  private emit(event: string, ...args: unknown[]): void {
    this.server?.emit(event, ...args);
  }
}
