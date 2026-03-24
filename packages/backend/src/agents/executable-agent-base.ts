import { Logger } from '@nestjs/common';
import {
  AgentConfig,
  AgentStatus,
  CliExecutionResult,
  CliOutputEvent,
} from '@monkagents/shared';
import { AgentExecutionContext, AgentExecutionCallbacks, ExecutableAgent } from './interfaces/agent.interface';
import { CliExecutor, DEFAULT_CLI_EXECUTION_CONFIG, CliExecutionConfig } from './helpers/cli-executor';
import { v4 as uuidv4 } from 'uuid';

// 导出类型以便其他模块可以使用
export { AgentExecutionContext, AgentExecutionCallbacks, ExecutableAgent };

/**
 * Base class for executable agents that can run CLI commands
 * Separates concerns by using CliExecutor helper class
 */
export abstract class ExecutableAgentBase implements ExecutableAgent {
  protected readonly logger: Logger;
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected wsService: any = null; // Using any to avoid circular dependency issues
  private cliExecutor?: CliExecutor;  // Make it optional initially
  private executionConfig: CliExecutionConfig;

  constructor(config: AgentConfig, executionConfig?: CliExecutionConfig) {
    this.config = config;
    this.logger = new Logger(`${config.name}Agent`);
    this.executionConfig = executionConfig || DEFAULT_CLI_EXECUTION_CONFIG;
    // Don't create CliExecutor in constructor since config might not be properly initialized yet
  }

  /**
   * Initialize the agent with configuration and setup CliExecutor
   * Should be called after the agent is properly configured
   */
  protected initializeAgent(config: AgentConfig): void {
    this.config = config;
    (this.logger as any).context = `${config.name}Agent`;
    // Now create CliExecutor with properly configured config
    this.cliExecutor = new CliExecutor(config, this.executionConfig);
  }

  /**
   * Ensure CliExecutor is available, lazy initialization
   */
  private ensureCliExecutor(): void {
    if (!this.cliExecutor) {
      this.logger.warn('CliExecutor not initialized, initializing with current config');
      this.cliExecutor = new CliExecutor(this.config, this.executionConfig);
    }
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Set WebSocket service for streaming output
   */
  setWebSocketService(wsService: any): void {
    this.wsService = wsService;
  }

  /**
   * Check if agent can handle the given task
   * Uses taskKeywords from configuration
   */
  canHandle(task: string): boolean {
    const keywords = this.config.taskKeywords;
    if (!keywords) {
      // Fallback: check capabilities
      return this.config.capabilities.length > 0;
    }

    const taskLower = task.toLowerCase();
    const allKeywords = [
      ...(keywords.high || []),
      ...(keywords.medium || []),
      ...(keywords.low || []),
      ...(keywords.general || []),
    ];

    return allKeywords.some(kw => taskLower.includes(kw.toLowerCase()));
  }

  /**
   * Get task priority weight based on configuration
   * Higher = more suitable for this agent
   */
  getPriorityWeight(task: string): number {
    const keywords = this.config.taskKeywords;
    if (!keywords) {
      return 0.5; // Default weight
    }

    const taskLower = task.toLowerCase();

    // Check high priority keywords
    if (keywords.high?.some(kw => taskLower.includes(kw.toLowerCase()))) {
      return 0.95;
    }

    // Check medium priority keywords
    if (keywords.medium?.some(kw => taskLower.includes(kw.toLowerCase()))) {
      return 0.85;
    }

    // Check low priority keywords
    if (keywords.low?.some(kw => taskLower.includes(kw.toLowerCase()))) {
      return 0.75;
    }

    // Check general keywords
    if (keywords.general?.some(kw => taskLower.includes(kw.toLowerCase()))) {
      return 0.65;
    }

    // Default weight for this agent
    return this.getDefaultWeight();
  }

  /**
   * Get default weight when no keywords match
   * Override in subclasses for specific behavior
   */
  protected getDefaultWeight(): number {
    // Different default weights based on role
    const roleWeights: Record<string, number> = {
      executor: 0.5,
      assistant: 0.4,
      inspector: 0.3,
      advisor: 0.2,
      master: 0.1,
    };
    return roleWeights[this.config.role] || 0.3;
  }

  /**
   * Get the system prompt for this agent
   * Combines persona with execution prompt configuration
   */
  protected getSystemPrompt(): string {
    return this.config.persona;
  }

  /**
   * Build the full prompt for CLI execution
   * Includes persona, task context, and execution instructions
   */
  protected buildPrompt(task: string, context?: AgentExecutionContext): string {
    const parts: string[] = [];

    // 1. Add persona (人设提示词)
    parts.push(this.getSystemPrompt());

    // 2. Add working directory context
    if (context?.sessionWorkingDirectory) {
      parts.push(`\n【工作目录】\n当前项目根目录: ${context.sessionWorkingDirectory}`);
      parts.push(`所有文件操作应在此目录下进行。`);
    }

    // 3. Add execution instructions
    parts.push(`\n【执行指令】`);
    parts.push(`请立即执行以下任务，使用可用的工具完成操作。`);
    parts.push(`执行完成后简要报告结果，不要只是回复消息。`);

    // 4. Add additional instructions if configured
    if (this.config.executionPrompt?.additionalInstructions) {
      parts.push(`\n【重要提示】\n${this.config.executionPrompt.additionalInstructions}`);
    }

    // 5. Add task description
    if (this.config.executionPrompt?.taskTemplate) {
      parts.push(`\n${this.config.executionPrompt.taskTemplate.replace('{task}', task)}`);
    } else {
      parts.push(`\n【当前任务】\n${task}`);
    }

    // 6. Add checklist if configured
    if (this.config.executionPrompt?.checklist && this.config.executionPrompt.checklist.length > 0) {
      parts.push('\n【注意事项】');
      this.config.executionPrompt.checklist.forEach((item, i) => {
        parts.push(`${i + 1}. ${item}`);
      });
    }

    // 7. Add boundaries reminder
    if (this.config.boundaries && this.config.boundaries.length > 0) {
      parts.push('\n【工作边界】');
      this.config.boundaries.forEach((boundary) => {
        parts.push(`- ${boundary}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Execute a task using CLI
   */
  async execute(
    context: AgentExecutionContext,
    callbacks?: AgentExecutionCallbacks,
  ): Promise<CliExecutionResult> {
    const { sessionId, workingDirectory, prompt, sessionWorkingDirectory } = context;

    this.logger.log(`Executing task: ${prompt.substring(0, 50)}...`);

    this.status = 'executing';

    // Only emit agent status event (not a message)
    if (this.wsService) {
      this.wsService.emitAgentStatus(this.config.id, 'executing', 'executing');
    }

    // Ensure CliExecutor is initialized
    this.ensureCliExecutor();

    // Start activity-based timeout check
    this.cliExecutor!.startActivityCheck();

    try {
      const fullPrompt = this.buildPrompt(prompt, context);

      // Define event handler
      const handleEvent = (event: CliOutputEvent) => {
        this.handleCliEvent(sessionId, event, callbacks);
      };

      // Execute via CLI executor
      const result = await this.cliExecutor!.execute(fullPrompt, sessionWorkingDirectory || workingDirectory, handleEvent);

      this.status = 'idle';
      this.cliExecutor!.stopActivityCheck();

      if (result.success) {
        callbacks?.onComplete?.(sessionId, result);
      } else {
        callbacks?.onError?.(sessionId, result.error || 'Execution failed');
      }

      // Only emit agent status event (not a message)
      if (this.wsService) {
        this.wsService.emitAgentStatus(this.config.id, 'idle', 'idle');
      }

      return result;
    } catch (error) {
      this.status = 'idle';
      this.cliExecutor!.stopActivityCheck();

      const errorMessage = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(sessionId, errorMessage);
      if (this.wsService) {
        this.wsService.emitAgentStatus(this.config.id, 'idle', 'error');
      }

      throw error;
    }
  }

  // Track streaming content to save final message
  private streamingContent: Map<string, string> = new Map();
  // Track which messages are being streamed (to ignore duplicate assistant messages)
  private activeStreamMessages: Set<string> = new Set();
  // Track which tools have been broadcasted (to avoid duplicates from stream_event and assistant messages)
  private broadcastedTools: Set<string> = new Set();

  /**
   * Handle CLI output event
   */
  protected handleCliEvent(
    sessionId: string,
    event: CliOutputEvent,
    callbacks?: AgentExecutionCallbacks,
  ): void {
    switch (event.type) {
      case 'init':
        callbacks?.onInit?.(sessionId);
        break;

      case 'text':
        callbacks?.onText?.(sessionId, event.content || '');
        if (event.isPartial) {
          // Partial message from stream_event - this is incremental content
          const streamKey = event.messageId || this.config.id;
          const existing = this.streamingContent.get(streamKey) || '';
          this.streamingContent.set(streamKey, existing + (event.content || ''));
          // Mark this message as actively streaming
          this.activeStreamMessages.add(streamKey);
          // Broadcast incremental content
          this.broadcastStreamingText(sessionId, event.content || '', event.messageId, false);
        } else {
          // Non-partial text - this could be a complete assistant message
          const streamKey = event.messageId || this.config.id;

          // Check if we're already streaming this message (from stream_event)
          // If so, ignore the assistant message to avoid duplicates
          if (this.activeStreamMessages.has(streamKey)) {
            // Already streaming this message via stream_event, skip the duplicate
            this.logger.debug(`Skipping duplicate assistant message for ${streamKey}`);
          } else {
            // Not streaming - this is a standalone non-streaming message
            // Broadcast and accumulate content
            this.broadcastStreamingText(sessionId, event.content || '', event.messageId, false);
            this.streamingContent.set(streamKey, event.content || '');
          }
        }
        break;

      case 'complete':
        // Message complete - save accumulated content to database
        // Note: saveStreamingMessage already sends completion signal to frontend
        this.saveStreamingMessage(sessionId, event.messageId);
        // Clear the active streaming marker
        const streamKey = event.messageId || this.config.id;
        this.activeStreamMessages.delete(streamKey);
        // Clear broadcasted tools tracking for this message
        this.broadcastedTools.clear();
        break;

      case 'tool_use':
        callbacks?.onToolUse?.(sessionId, event.toolName || '', event.toolInput || {});
        // Only broadcast when we have complete tool info (not just partial streaming)
        if (event.toolName && Object.keys(event.toolInput || {}).length > 0) {
          // Check if we already broadcasted this tool (avoid duplicates from stream_event + assistant)
          const toolKey = `${event.toolName}`;
          if (!this.broadcastedTools.has(toolKey)) {
            this.broadcastedTools.add(toolKey);
            this.broadcastToolUse(sessionId, event.toolName, event.toolInput || {});
          } else {
            this.logger.debug(`Skipping duplicate tool_use for ${event.toolName}`);
          }
        }
        break;

      case 'tool_result':
        // Tool execution complete - mark the tool as complete
        this.broadcastToolResult(sessionId, event.toolResult);
        break;

      case 'error':
        this.broadcastError(sessionId, event.error || 'Unknown error');
        break;

      case 'thinking':
        // Handle thinking events if needed
        break;
    }
  }

  /**
   * Save streaming message to database when complete
   * Uses stream- prefix ID to match frontend streaming message
   * Sends only completion signal to frontend (frontend already has content accumulated)
   */
  private saveStreamingMessage(sessionId: string, messageId?: string): void {
    const streamKey = messageId || this.config.id;
    const content = this.streamingContent.get(streamKey);
    const streamId = `stream-${messageId || this.config.id}`;

    if (this.wsService) {
      // Save content to database if we have it
      if (content) {
        this.saveMessageToDatabase(sessionId, streamId, content);
      }

      // Always send completion signal to frontend
      // Frontend uses this to mark the message as complete
      this.wsService.emitToSession(sessionId, 'message', {
        id: streamId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'text',
        content: '',
        createdAt: new Date(),
        metadata: { isComplete: true, isStreaming: false },
      });

      // Clear accumulated content
      this.streamingContent.delete(streamKey);
    }
  }

  /**
   * Save message to database only (not broadcasted to frontend)
   */
  private saveMessageToDatabase(sessionId: string, messageId: string, content: string): void {
    if (this.wsService) {
      // Use broadcastMessage with a flag to skip Redis save
      // Or directly call the session service to save
      this.wsService.saveMessageToDatabase(sessionId, {
        id: messageId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'text',
        content,
      });
    }
  }

  /**
   * Broadcast streaming text with proper message ID tracking
   * Streaming chunks are NOT saved to database - only the final complete message
   */
  protected broadcastStreamingText(
    sessionId: string,
    content: string,
    messageId?: string,
    isComplete: boolean = false,
  ): void {
    if (this.wsService) {
      // Use CLI message ID if available, otherwise use agent-based streaming ID
      const streamId = messageId
        ? `stream-${messageId}`
        : `stream-${this.config.id}`;

      // Note: Removed verbose debug logging for streaming chunks

      // For streaming, we use emitToSession directly to avoid saving to database
      // The final complete message will be saved separately
      this.wsService.emitToSession(sessionId, 'message', {
        id: streamId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: isComplete ? 'text' : 'thinking',
        content,
        createdAt: new Date(),
        metadata: { isComplete, isStreaming: !isComplete },
      } as any);
    }
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.status === 'executing') {
      this.logger.log('Cancelling execution');
      this.ensureCliExecutor();
      this.cliExecutor!.cancel();
      this.status = 'idle';
    }
  }

  /**
   * Check if agent is available
   */
  isAvailable(): boolean {
    this.ensureCliExecutor();
    return this.status === 'idle' && !this.cliExecutor!.isExecuting();
  }

  /**
   * Broadcast agent status (only emit agent_status event, no message)
   */
  protected broadcastAgentStatus(_sessionId: string, status: string, action?: string): void {
    if (this.wsService) {
      this.wsService.emitAgentStatus(this.config.id, status, action);
    }
  }

  // Track current tool message ID for updating status
  // Use a stack to handle nested/concurrent tool calls
  private toolStack: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  /**
   * Broadcast tool use - mark as in progress
   * Tool use messages are persisted to database
   */
  protected broadcastToolUse(sessionId: string, toolName: string, input: Record<string, unknown>): void {
    // Generate unique tool ID using uuid to avoid duplicates
    const toolId = `tool-${uuidv4()}`;

    // Push to stack for later reference
    this.toolStack.push({ id: toolId, name: toolName, input });

    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: toolId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'tool_use',
        content: `使用工具: ${toolName}`,
        metadata: { toolName, input, isComplete: false },
        createdAt: new Date(),
      });
    }
  }

  /**
   * Broadcast tool result - mark tool as complete
   * Updates the existing tool_use message (uses the most recent tool from stack)
   * Uses emitToSession to update frontend, and updates database metadata
   */
  protected broadcastToolResult(sessionId: string, result: unknown): void {
    // Pop the most recent tool from stack
    const tool = this.toolStack.pop();

    if (this.wsService && tool) {
      // Update frontend via WebSocket
      this.wsService.emitToSession(sessionId, 'message', {
        id: tool.id,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'tool_use',
        content: `工具执行完成`,
        metadata: {
          toolName: tool.name,
          input: tool.input,
          isComplete: true,
          result
        },
        createdAt: new Date(),
      });

      // Update the database record's metadata
      this.wsService.updateMessageMetadata(tool.id, {
        toolName: tool.name,
        input: tool.input,
        isComplete: true,
        result
      }).catch((err: Error) => {
        this.logger.error(`Failed to update tool message in database: ${err}`);
      });
    }
  }

  /**
   * Broadcast error
   */
  protected broadcastError(sessionId: string, error: string): void {
    if (this.wsService) {
      this.wsService.emitError('AGENT_ERROR', error, sessionId);
    }
  }
}