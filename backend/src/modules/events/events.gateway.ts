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
  CompleteInfoPayload,
  DmcaAlertPayload,
  ResponsePayload,
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

  /** Emits 'downloading_info' with a BARE manga_id string — replaces
   *  socketio.emit('downloading_info', manga_id). */
  emitDownloading(mangaId: string): void {
    this.server.emit(SOCKET_EVENTS.DOWNLOADING, mangaId);
  }

  /** Emits 'response' — the newest downloaded episode advanced.
   *  Replaces socketio.emit('response', { manga_id, ... }). */
  emitResponse(payload: ResponsePayload): void {
    this.server.emit(SOCKET_EVENTS.RESPONSE, payload);
  }

  /** Emits 'complete_info' — replaces socketio.emit('complete_info', ...) */
  emitComplete(payload: CompleteInfoPayload): void {
    this.server.emit(SOCKET_EVENTS.COMPLETE, payload);
  }

  /** Emits 'scan_completed' — replaces socketio.emit('scan_completed') */
  emitScanCompleted(): void {
    this.server.emit(SOCKET_EVENTS.SCAN_COMPLETED);
  }

  /** Emits 'dmca_alert' — used when scraper returns errorCode 504. */
  emitDmcaAlert(payload: DmcaAlertPayload): void {
    this.server.emit(SOCKET_EVENTS.DMCA_ALERT, payload);
  }
}
