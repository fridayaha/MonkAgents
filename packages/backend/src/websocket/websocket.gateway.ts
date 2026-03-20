import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebSocketService } from './websocket.service';
import { TangsengAgent } from '../agents/tangseng.agent';
import { TasksService } from '../tasks/tasks.service';
import { TaskPlanner } from '../agents/task-planner';
import { AgentsService } from '../agents/agents.service';

@WsGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(
    private readonly webSocketService: WebSocketService,
    private readonly tangsengAgent: TangsengAgent,
    private readonly tasksService: TasksService,
    private readonly taskPlanner: TaskPlanner,
    private readonly agentsService: AgentsService,
  ) {}

  afterInit(server: Server) {
    this.webSocketService.setServer(server);
    this.webSocketService.setDependencies(
      this.tangsengAgent,
      this.tasksService,
    );
    // Set dependencies for TangsengAgent
    this.tangsengAgent.setDependencies(
      this.taskPlanner,
      this.tasksService,
      this.webSocketService,
      this.agentsService,
    );
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    this.webSocketService.addClient(client);

    // Send welcome message
    client.emit('connected', {
      message: 'Connected to MonkAgents',
      timestamp: new Date(),
    });
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

    // Confirm join
    client.emit('joined', {
      sessionId,
      message: `Joined session: ${sessionId}`,
      timestamp: new Date(),
    });
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
  async handleMessage(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { sessionId: string; content: string },
  ): Promise<void> {
    this.logger.debug(`Message in session ${data.sessionId}: ${data.content.substring(0, 50)}...`);
    await this.webSocketService.handleUserMessage(_client.id, data.sessionId, data.content);
  }

  @SubscribeMessage('cancel')
  async handleCancel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() taskId: string,
  ): Promise<void> {
    this.logger.debug(`Cancel request for task: ${taskId}`);
    await this.webSocketService.cancelTask(taskId);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date() });
  }
}