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
import { SessionService } from '../session/session.service';
import { PermissionResponseEvent } from '@monkagents/shared';
import { TeamLeadAgent } from '../team/team-lead.agent';
import { TeamManager } from '../team/team.manager';
import { TaskListService } from '../team/task-list.service';
import { MailboxService } from '../team/mailbox.service';
import { WukongAgent } from '../agents/wukong.agent';
import { BajieAgent } from '../agents/bajie.agent';
import { ShasengAgent } from '../agents/shaseng.agent';
import { RulaiAgent } from '../agents/rulai.agent';

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
    private readonly sessionService: SessionService,
    // Team-based execution
    private readonly teamLeadAgent: TeamLeadAgent,
    private readonly teamManager: TeamManager,
    private readonly taskListService: TaskListService,
    private readonly mailboxService: MailboxService,
    private readonly wukongAgent: WukongAgent,
    private readonly bajieAgent: BajieAgent,
    private readonly shasengAgent: ShasengAgent,
    private readonly rulaiAgent: RulaiAgent,
  ) {}

  afterInit(server: Server) {
    this.webSocketService.setServer(server);
    this.webSocketService.setDependencies(
      this.tangsengAgent,
      this.tasksService,
      this.sessionService,
    );
    // Set WebSocket service on all agents for streaming
    this.agentsService.setWebSocketService(this.webSocketService).then(() => {
      this.logger.log('WebSocket service set on all agents successfully');
    }).catch(error => {
      this.logger.error('Failed to set WebSocket service on agents:', error);
    });
    // Set dependencies for TangsengAgent (legacy mode)
    this.tangsengAgent.setDependencies(
      this.taskPlanner,
      this.tasksService,
      this.webSocketService,
      this.agentsService,
      this.sessionService,
    );

    // ===== Team-based execution setup =====
    // Set dependencies for TeamLeadAgent
    this.teamLeadAgent.setDependencies(
      this.teamManager,
      this.taskListService,
      this.mailboxService,
      this.webSocketService,
      this.taskPlanner,
    );

    // Set team services for all teammate agents
    this.wukongAgent.setTeamServices(
      this.taskListService,
      this.mailboxService,
      this.teamManager,
    );
    this.bajieAgent.setTeamServices(
      this.taskListService,
      this.mailboxService,
      this.teamManager,
    );
    this.shasengAgent.setTeamServices(
      this.taskListService,
      this.mailboxService,
      this.teamManager,
    );
    this.rulaiAgent.setTeamServices(
      this.taskListService,
      this.mailboxService,
      this.teamManager,
    );

    this.logger.log('WebSocket Gateway initialized (Team mode enabled)');
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
    client.leave(`session:${sessionId}`);
    this.webSocketService.leaveSession(client.id, sessionId);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { sessionId: string; content: string },
  ): Promise<void> {
    await this.webSocketService.handleUserMessage(_client.id, data.sessionId, data.content);
  }

  @SubscribeMessage('cancel')
  async handleCancel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() taskId: string,
  ): Promise<void> {
    await this.webSocketService.cancelTask(taskId);
  }

  @SubscribeMessage('permission_response')
  async handlePermissionResponse(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: PermissionResponseEvent,
  ): Promise<void> {
    await this.webSocketService.handlePermissionResponse(data);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date() });
  }

  /**
   * Get team status for a session
   */
  @SubscribeMessage('team_status')
  async handleTeamStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ): Promise<void> {
    const team = this.teamLeadAgent.getTeamStatus(data.sessionId);
    if (team) {
      client.emit('team_status', {
        teamId: team.id,
        status: team.status,
        members: team.members.map(m => ({
          agentId: m.agentId,
          status: m.status,
          currentTaskId: m.currentTaskId,
          tasksCompleted: m.tasksCompleted,
        })),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Cancel a running team
   */
  @SubscribeMessage('team_cancel')
  async handleTeamCancel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { sessionId: string },
  ): Promise<void> {
    await this.teamLeadAgent.cancelTeam(data.sessionId);
    this.logger.log(`Team cancelled for session: ${data.sessionId}`);
  }
}