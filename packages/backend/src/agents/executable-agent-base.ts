import { Logger } from '@nestjs/common';
import {
  AgentConfig,
  AgentStatus,
  CliExecutionResult,
  CliOutputEvent,
} from '@monkagents/shared';
import { AgentExecutionContext, AgentExecutionCallbacks, ExecutableAgent } from './interfaces/agent.interface';
import { CliExecutor, DEFAULT_CLI_EXECUTION_CONFIG, CliExecutionConfig } from './helpers/cli-executor';

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
    this.logger.debug(`Working directory: ${sessionWorkingDirectory || workingDirectory}`);

    this.status = 'executing';

    // Broadcast status
    this.broadcastAgentStatus(sessionId, 'executing', '正在执行任务...');

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

      // Broadcast final status
      this.broadcastAgentStatus(sessionId, 'idle');

      return result;
    } catch (error) {
      this.status = 'idle';
      this.cliExecutor!.stopActivityCheck();

      const errorMessage = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(sessionId, errorMessage);
      this.broadcastAgentStatus(sessionId, 'idle');

      throw error;
    }
  }

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
        // For streaming, use message ID from CLI or fall back to agent-based ID
        if (event.isPartial) {
          // Partial message - stream with consistent ID
          this.broadcastStreamingText(sessionId, event.content || '', event.messageId, false);
        } else {
          // Complete message - finalize streaming
          this.broadcastStreamingText(sessionId, event.content || '', event.messageId, true);
        }
        break;

      case 'complete':
        // Message complete - finalize streaming
        this.broadcastStreamingComplete(sessionId, event.messageId);
        break;

      case 'tool_use':
        callbacks?.onToolUse?.(sessionId, event.toolName || '', event.toolInput || {});
        this.broadcastToolUse(sessionId, event.toolName || '', event.toolInput || {});
        break;

      case 'tool_result':
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
   * Broadcast streaming text with proper message ID tracking
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

      this.logger.debug(`Streaming text: streamId=${streamId}, content length=${content.length}, isComplete=${isComplete}`);

      this.wsService.broadcastMessage(sessionId, {
        id: streamId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'thinking',
        content,
        createdAt: new Date(),
        metadata: { isComplete, isStreaming: true },
      } as any);
    }
  }

  /**
   * Broadcast streaming complete - finalize the message
   */
  protected broadcastStreamingComplete(sessionId: string, messageId?: string): void {
    if (this.wsService) {
      const streamId = messageId
        ? `stream-${messageId}`
        : `stream-${this.config.id}`;

      this.logger.debug(`Streaming complete: streamId=${streamId}`);

      this.wsService.broadcastMessage(sessionId, {
        id: streamId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'text',
        content: '',
        createdAt: new Date(),
        metadata: { isComplete: true, isStreaming: false },
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
   * Broadcast agent status
   */
  protected broadcastAgentStatus(sessionId: string, status: string, action?: string): void {
    if (this.wsService) {
      this.wsService.emitAgentStatus(this.config.id, status, action);
      this.wsService.broadcastMessage(sessionId, {
        id: `status-${Date.now()}`,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'status',
        content: action || `状态: ${status}`,
        createdAt: new Date(),
      });
    }
  }

  /**
   * Broadcast tool use
   */
  protected broadcastToolUse(sessionId: string, toolName: string, input: Record<string, unknown>): void {
    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: `tool-${Date.now()}`,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'tool_use',
        content: `使用工具: ${toolName}`,
        metadata: { toolName, input },
        createdAt: new Date(),
      });
    }
  }

  /**
   * Broadcast tool result
   */
  protected broadcastToolResult(sessionId: string, result: unknown): void {
    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: `result-${Date.now()}`,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'tool_result',
        content: '工具执行完成',
        metadata: { result },
        createdAt: new Date(),
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