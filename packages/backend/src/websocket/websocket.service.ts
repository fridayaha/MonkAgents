import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { Message, StreamChunk, CliOutputEvent, MessageType } from '@monkagents/shared';
import { TangsengAgent } from '../agents/tangseng.agent';
import { TasksService } from '../tasks/tasks.service';
import { AgentMentionService, ParsedMessage } from '../agents/agent-mention.service';
import { AgentsService } from '../agents/agents.service';
import { SessionService, CreateMessageInput } from '../session/session.service';
import { RedisService } from '../redis/redis.service';

/**
 * Message types that should be persisted to the database
 */
const PERSISTABLE_MESSAGE_TYPES: Set<MessageType> = new Set([
  'text',
  'tool_use',
  'error',
]);

/**
 * Message types that should NOT be persisted (transient)
 */
const TRANSIENT_MESSAGE_TYPES: Set<MessageType> = new Set([
  'status',
  'thinking',
  'chat_complete',
]);

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
  }

  removeClient(client: Socket): void {
    this.clients.delete(client.id);
    this.clientSessions.delete(client.id);
  }

  joinSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.add(sessionId);
    }

    // Load and send session history from Redis
    this.loadAndSendSessionHistory(clientId, sessionId);
  }

  leaveSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.delete(sessionId);
    }
  }

  /**
   * Load session history from database and Redis, then send to client
   * Database is the source of truth, Redis is used for quick access
   */
  private async loadAndSendSessionHistory(clientId: string, sessionId: string): Promise<void> {
    try {
      let messages: Message[] = [];

      // Try to load from database first (source of truth)
      if (this.sessionService) {
        const dbMessages = await this.sessionService.getSessionMessages(sessionId);
        if (dbMessages.length > 0) {
          messages = dbMessages.map(m => ({
            id: m.id,
            sessionId: m.sessionId,
            taskId: m.taskId ?? undefined,
            subtaskId: m.subtaskId ?? undefined,
            sender: m.sender,
            senderId: m.senderId,
            senderName: m.senderName,
            type: m.type,
            content: m.content,
            metadata: m.metadata ?? undefined,
            createdAt: m.createdAt,
          }));
        }
      }

      // If no database messages, fall back to Redis
      if (messages.length === 0) {
        const redisHistory = await this.redisService.getSessionHistory(sessionId, 100);
        if (redisHistory.length > 0) {
          messages = redisHistory;
        }
      }

      // Send history to client
      if (messages.length > 0) {
        const client = this.clients.get(clientId);
        if (client) {
          client.emit('session_history', {
            sessionId,
            messages,
            count: messages.length,
          });
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
  async handleUserMessage(_clientId: string, sessionId: string, content: string): Promise<void> {
    // Get session working directory
    const workingDirectory = await this.getSessionWorkingDirectory(sessionId);

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
    this.emitAgentStatus(primaryAgentId, 'thinking', 'thinking');

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

      await agent.execute(context, {
        // Note: All callbacks removed - agent handles broadcasting internally via:
        // - broadcastStreamingText for text messages
        // - broadcastToolUse for tool_use messages
        // - broadcastError for error messages
        onComplete: (_sessionId: string, execResult) => {
          // Only update agent status, don't broadcast completion message
          this.emitAgentStatus(primaryAgentId, 'idle', execResult.success ? 'idle' : 'error');
        },
      });

      // Don't broadcast final result message - user can see the actual response

    } catch (error) {
      this.logger.error(`Agent execution error: ${error}`);
      this.emitError('EXECUTION_ERROR', `执行失败: ${error}`, sessionId);
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
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
   * This is the primary method for sending messages to clients
   * Messages are:
   * 1. Broadcasted to WebSocket clients
   * 2. Saved to MySQL conversation table (if persistable)
   * 3. Saved to Redis for quick history access (if persistable)
   */
  broadcastMessage(sessionId: string, message: Message): void {
    // Emit to WebSocket clients
    this.emitToSession(sessionId, 'message', message);

    // Determine if this message should be persisted
    const shouldPersist = this.shouldPersistMessage(message);

    if (shouldPersist) {
      // Save to MySQL conversation table
      this.saveMessageToDatabase(sessionId, message).catch(err => {
        this.logger.error(`Failed to save message to database: ${err}`);
      });

      // Save to Redis history for quick loading
      this.redisService.addMessageToHistory(sessionId, message).catch(err => {
        this.logger.error(`Failed to save message to Redis: ${err}`);
      });
    }
  }

  /**
   * Determine if a message should be persisted to storage
   * Streaming messages (isStreaming=true) are not persisted
   * Transient message types are not persisted
   */
  private shouldPersistMessage(message: Message): boolean {
    // Don't persist streaming chunks
    if (message.metadata?.isStreaming === true) {
      return false;
    }

    // Don't persist transient message types
    if (TRANSIENT_MESSAGE_TYPES.has(message.type)) {
      return false;
    }

    // Persist text, tool_use, error messages
    return PERSISTABLE_MESSAGE_TYPES.has(message.type);
  }

  /**
   * Save a message to the MySQL conversation table
   * Can be called directly to persist without broadcasting
   */
  async saveMessageToDatabase(sessionId: string, message: Partial<Message> & { id: string; sender: Message['sender']; senderId: string; senderName: string; type: Message['type']; content: string }): Promise<void> {
    if (!this.sessionService) {
      this.logger.warn('SessionService not available, cannot save message to database');
      return;
    }

    const input: CreateMessageInput = {
      id: message.id,
      taskId: message.taskId,
      subtaskId: message.subtaskId,
      sender: message.sender,
      senderId: message.senderId,
      senderName: message.senderName,
      type: message.type,
      content: message.content,
      metadata: message.metadata,
    };

    await this.sessionService.addMessage(sessionId, input);
  }

  /**
   * Update a message's metadata in the database
   * Used for updating tool_use message status
   */
  async updateMessageMetadata(messageId: string, metadata: Record<string, unknown>): Promise<void> {
    if (!this.sessionService) {
      this.logger.warn('SessionService not available, cannot update message metadata');
      return;
    }

    await this.sessionService.updateMessageMetadata(messageId, metadata);
  }

  /**
   * Broadcast agent thinking/working status
   * Only emits agent_status event, no message broadcast
   */
  broadcastAgentActivity(
    _sessionId: string,
    agentId: string,
    _agentName: string,
    status: 'thinking' | 'executing' | 'idle',
    activity?: string,
  ): void {
    // Only emit agent status event, don't broadcast message
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