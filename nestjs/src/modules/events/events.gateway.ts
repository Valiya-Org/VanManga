import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  ChapterProgressPayload,
  CompleteInfoPayload,
  DownloadingInfoPayload,
  SOCKET_EVENTS,
} from './events.types';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
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

  /** Emits 'downloading_info' — replaces socketio.emit('downloading_info', ...) */
  emitDownloading(payload: DownloadingInfoPayload): void {
    this.server.emit(SOCKET_EVENTS.DOWNLOADING, payload);
  }

  /** Emits 'response' — replaces socketio.emit('response', ...) */
  emitProgress(payload: ChapterProgressPayload): void {
    this.server.emit(SOCKET_EVENTS.PROGRESS, payload);
  }

  /** Emits 'complete_info' — replaces socketio.emit('complete_info', ...) */
  emitComplete(payload: CompleteInfoPayload): void {
    this.server.emit(SOCKET_EVENTS.COMPLETE, payload);
  }

  /** Emits 'scan_completed' — replaces socketio.emit('scan_completed') */
  emitScanCompleted(): void {
    this.server.emit(SOCKET_EVENTS.SCAN_COMPLETED);
  }
}
