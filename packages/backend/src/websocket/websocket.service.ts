import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { Message, StreamChunk, CliOutputEvent } from '@monkagents/shared';
import { TangsengAgent } from '../agents/tangseng.agent';
import { TasksService } from '../tasks/tasks.service';

/**
 * Service for WebSocket communication and task coordination
 */
@Injectable()
export class WebSocketService implements OnModuleInit {
  private readonly logger = new Logger(WebSocketService.name);
  private clients: Map<string, Socket> = new Map();
  private clientSessions: Map<string, Set<string>> = new Map();
  private server: Server;

  // Will be injected after module initialization to avoid circular deps
  private tangsengAgent: TangsengAgent | null = null;
  private tasksService: TasksService | null = null;

  onModuleInit() {
    // Server will be set by the gateway after initialization
  }

  /**
   * Set dependencies (called by gateway after init)
   */
  setDependencies(
    tangsengAgent: TangsengAgent,
    tasksService: TasksService,
  ): void {
    this.tangsengAgent = tangsengAgent;
    this.tasksService = tasksService;
  }

  setServer(server: Server) {
    this.server = server;
  }

  addClient(client: Socket): void {
    this.clients.set(client.id, client);
    this.clientSessions.set(client.id, new Set());
    this.logger.debug(`Client connected: ${client.id}`);
  }

  removeClient(client: Socket): void {
    this.clients.delete(client.id);
    this.clientSessions.delete(client.id);
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  joinSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.add(sessionId);
      this.logger.debug(`Client ${clientId} joined session: ${sessionId}`);
    }
  }

  leaveSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.delete(sessionId);
      this.logger.debug(`Client ${clientId} left session: ${sessionId}`);
    }
  }

  /**
   * Handle user message - process through Tangseng agent
   */
  async handleUserMessage(clientId: string, sessionId: string, content: string): Promise<void> {
    this.logger.debug(`User message from ${clientId} in ${sessionId}: ${content}`);

    // Send acknowledgment
    this.emitToSession(sessionId, 'message', {
      id: `ack-${Date.now()}`,
      sessionId,
      sender: 'system',
      senderId: 'system',
      senderName: '系统',
      type: 'status',
      content: '正在处理您的请求...',
      createdAt: new Date(),
    } as Message);

    // Check if dependencies are set
    if (!this.tangsengAgent || !this.tasksService) {
      this.emitError('SERVICE_UNAVAILABLE', '服务未初始化，请稍后重试', sessionId);
      return;
    }

    try {
      // Process through Tangseng agent
      const task = await this.tangsengAgent.processUserMessage(sessionId, content);

      // Broadcast task creation
      this.emitToSession(sessionId, 'task_status', {
        taskId: task.id,
        status: task.status,
        message: '任务已创建',
      });
    } catch (error) {
      this.logger.error(`Error processing message: ${error}`);
      this.emitError('PROCESSING_ERROR', `处理请求失败: ${error}`, sessionId);
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    this.logger.debug(`Cancel request for task: ${taskId}`);

    if (!this.tasksService) {
      return;
    }

    try {
      const task = await this.tasksService.cancel(taskId);
      this.emitTaskStatus(taskId, task.status, '任务已取消');
    } catch (error) {
      this.logger.error(`Error cancelling task: ${error}`);
    }
  }

  /**
   * Emit to all clients in a session
   */
  emitToSession(sessionId: string, event: string, data: unknown): void {
    if (this.server) {
      this.server.to(`session:${sessionId}`).emit(event, data);
    }
  }

  /**
   * Emit to all connected clients
   */
  emitToAll(event: string, data: unknown): void {
    if (this.server) {
      this.server.emit(event, data);
    }
  }

  /**
   * Emit agent status update
   */
  emitAgentStatus(agentId: string, status: string, action?: string): void {
    if (this.server) {
      this.server.emit('agent_status', { agentId, status, action, timestamp: new Date() });
    }
  }

  /**
   * Emit task status update
   */
  emitTaskStatus(taskId: string, status: string, message?: string): void {
    if (this.server) {
      this.server.emit('task_status', { taskId, status, message, timestamp: new Date() });
    }
  }

  /**
   * Emit stream chunk for real-time output
   */
  emitStreamChunk(sessionId: string, chunk: StreamChunk): void {
    this.emitToSession(sessionId, 'stream', chunk);
  }

  /**
   * Emit CLI output event as stream
   */
  emitCliOutput(sessionId: string, agentId: string, event: CliOutputEvent): void {
    const chunk: StreamChunk = {
      messageId: `${agentId}-${Date.now()}`,
      index: 0,
      content: event.content || '',
      isComplete: event.type === 'complete',
    };

    this.emitToSession(sessionId, 'stream', {
      ...chunk,
      agentId,
      eventType: event.type,
      toolName: event.toolName,
      metadata: event.metadata,
    });
  }

  /**
   * Emit error
   */
  emitError(code: string, message: string, sessionId?: string): void {
    const errorData = { code, message, timestamp: new Date() };
    if (sessionId && this.server) {
      this.server.to(`session:${sessionId}`).emit('error', errorData);
    } else if (this.server) {
      this.server.emit('error', errorData);
    }
  }

  /**
   * Broadcast message to session
   */
  broadcastMessage(sessionId: string, message: Message): void {
    this.emitToSession(sessionId, 'message', message);
  }

  /**
   * Broadcast agent thinking/working status
   */
  broadcastAgentActivity(
    sessionId: string,
    agentId: string,
    agentName: string,
    status: 'thinking' | 'executing' | 'idle',
    activity?: string,
  ): void {
    this.broadcastMessage(sessionId, {
      id: `activity-${Date.now()}`,
      sessionId,
      sender: 'agent',
      senderId: agentId,
      senderName: agentName,
      type: 'status',
      content: activity || (status === 'thinking' ? '正在思考...' : '执行中...'),
      metadata: { status },
      createdAt: new Date(),
    });

    this.emitAgentStatus(agentId, status, activity);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get session clients
   */
  getSessionClients(sessionId: string): string[] {
    const clients: string[] = [];
    for (const [clientId, sessions] of this.clientSessions) {
      if (sessions.has(sessionId)) {
        clients.push(clientId);
      }
    }
    return clients;
  }
}