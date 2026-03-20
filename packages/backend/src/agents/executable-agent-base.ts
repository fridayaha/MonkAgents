import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import {
  AgentConfig,
  AgentStatus,
  CliExecutionResult,
  CliOutputEvent,
} from '@monkagents/shared';
import { CliOutputParser } from '../cli/cli.parser';
import { WebSocketService } from '../websocket/websocket.service';

/**
 * Context for agent execution
 */
export interface AgentExecutionContext {
  sessionId: string;
  taskId: string;
  subtaskId: string;
  workingDirectory: string;
  prompt: string;
}

/**
 * Callbacks for agent execution
 */
export interface AgentExecutionCallbacks {
  onInit?: (sessionId: string) => void;
  onText?: (sessionId: string, text: string) => void;
  onToolUse?: (sessionId: string, name: string, input: Record<string, unknown>) => void;
  onComplete?: (sessionId: string, result: CliExecutionResult) => void;
  onError?: (sessionId: string, error: string) => void;
}

/**
 * Base class for executable agents that can run CLI commands
 */
export abstract class ExecutableAgentBase {
  protected readonly logger: Logger;
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected currentProcess: ChildProcess | null = null;
  protected parser: CliOutputParser;
  protected wsService: WebSocketService | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.logger = new Logger(`${config.name}Agent`);
    this.parser = new CliOutputParser();
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
  setWebSocketService(wsService: WebSocketService): void {
    this.wsService = wsService;
  }

  /**
   * Check if agent can handle the given task
   */
  abstract canHandle(task: string): boolean;

  /**
   * Get the system prompt for this agent
   */
  protected getSystemPrompt(): string {
    return this.config.persona;
  }

  /**
   * Build the full prompt for CLI execution
   */
  protected buildPrompt(task: string, context?: AgentExecutionContext): string {
    const parts = [this.getSystemPrompt()];

    if (context) {
      parts.push(`\n当前工作目录: ${context.workingDirectory}`);
    }

    parts.push(`\n请执行以下任务:\n${task}`);

    return parts.join('\n');
  }

  /**
   * Execute a task using CLI
   */
  async execute(
    context: AgentExecutionContext,
    callbacks?: AgentExecutionCallbacks,
  ): Promise<CliExecutionResult> {
    const { sessionId, workingDirectory, prompt } = context;

    this.logger.log(`执行任务: ${prompt.substring(0, 50)}...`);
    this.status = 'executing';

    // Broadcast status
    this.broadcastAgentStatus(sessionId, 'executing', '正在执行任务...');

    return new Promise((resolve, reject) => {
      const { command, args } = this.config.cli;
      const fullPrompt = this.buildPrompt(prompt, context);

      this.logger.debug(`Starting CLI: ${command} ${args.join(' ')}`);

      this.currentProcess = spawn(command, [...args, fullPrompt], {
        cwd: workingDirectory || process.cwd(),
        shell: true,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || '',
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
          ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
        },
      });

      let output = '';
      let error = '';
      let sessionIdFromCli: string | undefined;

      // Handle stdout
      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;

        // Parse events
        const events = this.parser.parseChunk(chunk);
        for (const event of events) {
          this.handleCliEvent(sessionId, event, callbacks);

          if (event.sessionId) {
            sessionIdFromCli = event.sessionId;
          }
        }
      });

      // Handle stderr
      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        error += data.toString();
        this.logger.warn(`CLI stderr: ${data.toString()}`);
      });

      // Handle process close
      this.currentProcess.on('close', (code: number) => {
        this.currentProcess = null;
        this.status = 'idle';

        // Flush remaining output
        const remainingEvents = this.parser.flush();
        for (const event of remainingEvents) {
          this.handleCliEvent(sessionId, event, callbacks);
        }

        const result: CliExecutionResult = {
          success: code === 0,
          sessionId: sessionIdFromCli,
          output,
          error: code !== 0 ? error || `Process exited with code ${code}` : undefined,
        };

        this.broadcastAgentStatus(sessionId, 'idle');

        if (code === 0) {
          callbacks?.onComplete?.(sessionId, result);
          resolve(result);
        } else {
          callbacks?.onError?.(sessionId, result.error || 'Execution failed');
          resolve(result);
        }

        this.parser.reset();
      });

      // Handle process error
      this.currentProcess.on('error', (err: Error) => {
        this.currentProcess = null;
        this.status = 'idle';
        this.logger.error(`CLI error: ${err.message}`);

        callbacks?.onError?.(sessionId, err.message);
        this.broadcastAgentStatus(sessionId, 'idle');
        reject(err);
      });
    });
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
        this.broadcastMessage(sessionId, event.content || '', 'thinking');
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
    }
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.currentProcess) {
      this.logger.log('Cancelling execution');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
      this.status = 'idle';
      this.parser.reset();
    }
  }

  /**
   * Check if agent is available
   */
  isAvailable(): boolean {
    return this.status === 'idle';
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
   * Broadcast message
   */
  protected broadcastMessage(sessionId: string, content: string, type: string = 'text'): void {
    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: `msg-${Date.now()}`,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: type as any,
        content,
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