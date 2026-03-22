import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { Message, StreamChunk, CliOutputEvent } from '@monkagents/shared';
import { TangsengAgent } from '../agents/tangseng.agent';
import { TasksService } from '../tasks/tasks.service';
import { AgentMentionService, ParsedMessage } from '../agents/agent-mention.service';
import { AgentsService } from '../agents/agents.service';
import { SessionService } from '../session/session.service';
import { RedisService } from '../redis/redis.service';

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
  private sessionService: SessionService | null = null;

  constructor(
    private readonly mentionService: AgentMentionService,
    private readonly agentsService: AgentsService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    // Server will be set by the gateway after initialization
  }

  /**
   * Set dependencies (called by gateway after init)
   */
  setDependencies(
    tangsengAgent: TangsengAgent,
    tasksService: TasksService,
    sessionService: SessionService,
  ): void {
    this.tangsengAgent = tangsengAgent;
    this.tasksService = tasksService;
    this.sessionService = sessionService;
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

    // Load and send session history from Redis
    this.loadAndSendSessionHistory(clientId, sessionId);
  }

  leaveSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.delete(sessionId);
      this.logger.debug(`Client ${clientId} left session: ${sessionId}`);
    }
  }

  /**
   * Load session history from Redis and send to client
   */
  private async loadAndSendSessionHistory(clientId: string, sessionId: string): Promise<void> {
    try {
      const history = await this.redisService.getSessionHistory(sessionId, 100);

      if (history.length > 0) {
        const client = this.clients.get(clientId);
        if (client) {
          // Send history to the specific client
          client.emit('session_history', {
            sessionId,
            messages: history,
            count: history.length,
          });
          this.logger.debug(`Sent ${history.length} history messages to client ${clientId}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load session history: ${error}`);
    }
  }

  /**
   * Get session working directory
   */
  private async getSessionWorkingDirectory(sessionId: string): Promise<string> {
    try {
      if (this.sessionService) {
        const session = await this.sessionService.findOne(sessionId);
        return session.workingDirectory || process.cwd();
      }
    } catch (error) {
      this.logger.warn(`Failed to get session working directory: ${error}`);
    }
    return process.cwd();
  }

  /**
   * Handle user message - process through Tangseng agent for intelligent planning
   */
  async handleUserMessage(clientId: string, sessionId: string, content: string): Promise<void> {
    this.logger.debug(`User message from ${clientId} in ${sessionId}: ${content}`);

    // Get session working directory
    const workingDirectory = await this.getSessionWorkingDirectory(sessionId);
    this.logger.debug(`Session working directory: ${workingDirectory}`);

    // Save user message to history first
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sessionId,
      sender: 'user',
      senderId: 'user',
      senderName: '唐明皇',
      type: 'text',
      content,
      createdAt: new Date(),
    };
    this.broadcastMessage(sessionId, userMessage);

    // Parse message for @mentions
    const parsedMessage = this.mentionService.parseMessage(content);

    // Check if dependencies are set
    if (!this.tangsengAgent || !this.tasksService) {
      this.emitError('SERVICE_UNAVAILABLE', '服务未初始化，请稍后重试', sessionId);
      return;
    }

    try {
      // Check if there's a direct @mention to a specific agent
      if (parsedMessage.hasMentions && parsedMessage.primaryAgent) {
        // Direct routing to mentioned agent(s)
        await this.routeToSpecificAgent(sessionId, parsedMessage, workingDirectory);
      } else {
        // All other messages go through Tangseng for intelligent planning
        // The planner will determine if it's a chat, task, or help scenario
        await this.tangsengAgent.processUserMessage(sessionId, content, workingDirectory);
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${error}`);
      this.emitError('PROCESSING_ERROR', `处理请求失败: ${error}`, sessionId);
    }
  }

  /**
   * Route message to specific agent(s) mentioned
   */
  private async routeToSpecificAgent(sessionId: string, parsedMessage: ParsedMessage, workingDirectory: string): Promise<void> {
    const primaryAgentId = parsedMessage.primaryAgent!;

    // Special handling for Tangseng (master) - he's a coordinator, not an executor
    if (primaryAgentId === 'tangseng') {
      await this.tangsengAgent?.processUserMessage(sessionId, parsedMessage.cleanedContent, workingDirectory);
      return;
    }

    // Get agent status
    const agentStatus = this.agentsService.getAgentsStatusSummary()[primaryAgentId];

    if (!agentStatus) {
      this.emitError('AGENT_NOT_FOUND', `未找到智能体: ${primaryAgentId}`, sessionId);
      return;
    }

    if (!agentStatus.available) {
      this.emitToSession(sessionId, 'message', {
        id: `msg-${Date.now()}`,
        sessionId,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'status',
        content: `${this.mentionService.getAgentName(primaryAgentId)}正在忙碌中，任务已加入队列...`,
        createdAt: new Date(),
      } as Message);
    }

    // Build the task prompt
    const taskPrompt = this.mentionService.buildCollaborationInstruction(
      parsedMessage.mentions,
      parsedMessage.cleanedContent,
    );

    // Get executable agent
    const agent = this.agentsService.getExecutableAgent(primaryAgentId);

    if (!agent) {
      // Fallback to Tangseng agent
      await this.tangsengAgent?.processUserMessage(sessionId, parsedMessage.cleanedContent, workingDirectory);
      return;
    }

    // Broadcast that the agent is starting
    this.broadcastAgentActivity(
      sessionId,
      primaryAgentId,
      this.mentionService.getAgentName(primaryAgentId),
      'thinking',
      '正在思考...',
    );

    try {
      // Execute task through the agent with proper working directory
      const context = {
        sessionId,
        taskId: `task-${Date.now()}`,
        subtaskId: `subtask-${Date.now()}`,
        workingDirectory,
        sessionWorkingDirectory: workingDirectory,
        prompt: taskPrompt,
      };

      const result = await agent.execute(context, {
        // Note: onText callback removed - streaming is handled by agent's broadcastStreamingText
        // which properly appends chunks to the same message
        onToolUse: (_sessionId: string, name: string, input: Record<string, unknown>) => {
          this.emitToSession(sessionId, 'message', {
            id: `tool-${Date.now()}`,
            sessionId,
            sender: 'agent',
            senderId: primaryAgentId,
            senderName: this.mentionService.getAgentName(primaryAgentId),
            type: 'tool_use',
            content: `使用工具: ${name}`,
            metadata: { toolName: name, input },
            createdAt: new Date(),
          } as Message);
        },
        onComplete: (_sessionId: string, execResult) => {
          const statusMessage = execResult.success ? '任务完成' : '任务完成（有警告）';
          this.broadcastAgentActivity(
            sessionId,
            primaryAgentId,
            this.mentionService.getAgentName(primaryAgentId),
            'idle',
            statusMessage,
          );
        },
        onError: (_sessionId: string, error: string) => {
          this.emitToSession(sessionId, 'message', {
            id: `error-${Date.now()}`,
            sessionId,
            sender: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'error',
            content: `执行出错: ${error}`,
            createdAt: new Date(),
          } as Message);
        },
      });

      // Broadcast final result
      this.emitToSession(sessionId, 'message', {
        id: `result-${Date.now()}`,
        sessionId,
        sender: 'agent',
        senderId: primaryAgentId,
        senderName: this.mentionService.getAgentName(primaryAgentId),
        type: 'status',
        content: result.success ? '任务已完成' : '任务执行失败',
        metadata: { result },
        createdAt: new Date(),
      } as Message);

    } catch (error) {
      this.logger.error(`Agent execution error: ${error}`);
      this.emitError('EXECUTION_ERROR', `执行失败: ${error}`, sessionId);
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

    // Save message to Redis history
    this.redisService.addMessageToHistory(sessionId, message).catch(err => {
      this.logger.error(`Failed to save message to Redis: ${err}`);
    });
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