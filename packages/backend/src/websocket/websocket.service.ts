import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { Message, StreamChunk, CliOutputEvent } from '@monkagents/shared';
import { TangsengAgent } from '../agents/tangseng.agent';
import { TasksService } from '../tasks/tasks.service';
import { AgentMentionService, ParsedMessage } from '../agents/agent-mention.service';
import { AgentsService } from '../agents/agents.service';
import { ChatService } from '../agents/chat.service';

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

  constructor(
    private readonly mentionService: AgentMentionService,
    private readonly agentsService: AgentsService,
    private readonly chatService: ChatService,
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
   * Handle user message - process through Tangseng agent or route to specific agent
   */
  async handleUserMessage(clientId: string, sessionId: string, content: string): Promise<void> {
    this.logger.debug(`User message from ${clientId} in ${sessionId}: ${content}`);

    // Parse message for @mentions
    const parsedMessage = this.mentionService.parseMessage(content);

    // Send acknowledgment with mention info
    this.emitToSession(sessionId, 'message', {
      id: `ack-${Date.now()}`,
      sessionId,
      sender: 'system',
      senderId: 'system',
      senderName: '系统',
      type: 'status',
      content: this.getStatusMessage(parsedMessage),
      createdAt: new Date(),
    } as Message);

    // Check if dependencies are set
    if (!this.tangsengAgent || !this.tasksService) {
      this.emitError('SERVICE_UNAVAILABLE', '服务未初始化，请稍后重试', sessionId);
      return;
    }

    try {
      // Determine message type and route accordingly
      if (parsedMessage.hasMentions && parsedMessage.primaryAgent) {
        // Direct routing to mentioned agent(s)
        await this.routeToSpecificAgent(sessionId, parsedMessage);
      } else if (this.chatService.isChatMessage(content, parsedMessage)) {
        // Group chat mode - all agents respond based on their personality
        await this.chatService.handleChatMessage(sessionId, content, this);
      } else if (this.chatService.isTaskRequest(content)) {
        // Task mode - Tangseng decomposes and assigns tasks
        await this.handleTaskRequest(sessionId, content);
      } else {
        // Default routing through Tangseng (master) agent
        const task = await this.tangsengAgent.processUserMessage(sessionId, content);

        // Broadcast task creation
        this.emitToSession(sessionId, 'task_status', {
          taskId: task.id,
          status: task.status,
          message: '任务已创建，正在分析...',
        });
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${error}`);
      this.emitError('PROCESSING_ERROR', `处理请求失败: ${error}`, sessionId);
    }
  }

  /**
   * Handle task request - Tangseng decomposes and assigns
   */
  private async handleTaskRequest(sessionId: string, content: string): Promise<void> {
    this.logger.log(`Handling task request: ${content}`);

    // Broadcast that Tangseng is thinking
    this.broadcastAgentActivity(
      sessionId,
      'tangseng',
      '唐僧',
      'thinking',
      '正在分析任务...',
    );

    // Generate task breakdown
    const { assignments } = this.chatService.generateTaskBreakdown(content);

    // Generate Tangseng's response
    const tangsengResponse = this.chatService.generateTangsengTaskResponse(content, assignments);

    // Broadcast Tangseng's analysis
    this.broadcastMessage(sessionId, {
      id: `msg-${Date.now()}-tangseng`,
      sessionId,
      sender: 'agent',
      senderId: 'tangseng',
      senderName: '唐僧',
      type: 'text',
      content: tangsengResponse,
      createdAt: new Date(),
    });

    // Broadcast Tangseng idle
    this.broadcastAgentActivity(
      sessionId,
      'tangseng',
      '唐僧',
      'idle',
    );

    // Create task records and potentially execute
    // For now, just broadcast the task assignments
    for (const assignment of assignments) {
      this.broadcastMessage(sessionId, {
        id: `task-${Date.now()}-${assignment.agentId}`,
        sessionId,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'task_assignment',
        content: `任务已分配给 @${assignment.agentName}`,
        metadata: {
          taskId: `task-${Date.now()}`,
          agentId: assignment.agentId,
          task: assignment.task,
          priority: assignment.priority,
        },
        createdAt: new Date(),
      });
    }
  }

  /**
   * Route message to specific agent(s) mentioned
   */
  private async routeToSpecificAgent(sessionId: string, parsedMessage: ParsedMessage): Promise<void> {
    const primaryAgentId = parsedMessage.primaryAgent!;

    // Special handling for Tangseng (master) - he's a coordinator, not an executor
    if (primaryAgentId === 'tangseng') {
      await this.tangsengAgent?.processUserMessage(sessionId, parsedMessage.cleanedContent);
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
      await this.tangsengAgent?.processUserMessage(sessionId, parsedMessage.cleanedContent);
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
      // Execute task through the agent
      const context = {
        sessionId,
        taskId: `task-${Date.now()}`,
        subtaskId: `subtask-${Date.now()}`,
        workingDirectory: process.cwd(),
        prompt: taskPrompt,
      };

      const result = await agent.execute(context, {
        onText: (_sessionId: string, text: string) => {
          this.emitToSession(sessionId, 'message', {
            id: `msg-${Date.now()}`,
            sessionId,
            sender: 'agent',
            senderId: primaryAgentId,
            senderName: this.mentionService.getAgentName(primaryAgentId),
            type: 'text',
            content: text,
            createdAt: new Date(),
          } as Message);
        },
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
   * Get status message based on parsed message
   */
  private getStatusMessage(parsedMessage: ParsedMessage): string {
    if (parsedMessage.hasMentions) {
      const agentNames = parsedMessage.mentions.map(m => m.agentName).join('、');
      return `已召唤 ${agentNames} 处理您的请求...`;
    }
    return '正在处理您的请求...';
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