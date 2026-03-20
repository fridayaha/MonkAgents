import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebSocketService } from './websocket.service';

@WsGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(private readonly webSocketService: WebSocketService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    this.webSocketService.addClient(client);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.webSocketService.removeClient(client);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() sessionId: string,
  ): void {
    this.logger.debug(`Client ${client.id} joining session: ${sessionId}`);
    client.join(`session:${sessionId}`);
    this.webSocketService.joinSession(client.id, sessionId);
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() sessionId: string,
  ): void {
    this.logger.debug(`Client ${client.id} leaving session: ${sessionId}`);
    client.leave(`session:${sessionId}`);
    this.webSocketService.leaveSession(client.id, sessionId);
  }

  @SubscribeMessage('message')
  handleMessage(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { sessionId: string; content: string },
  ): void {
    this.logger.debug(`Message in session ${data.sessionId}`);
    this.webSocketService.handleUserMessage(data.sessionId, data.sessionId, data.content);
  }

  @SubscribeMessage('cancel')
  handleCancel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() taskId: string,
  ): void {
    this.logger.debug(`Cancel request for task: ${taskId}`);
    this.webSocketService.cancelTask(taskId);
  }
}