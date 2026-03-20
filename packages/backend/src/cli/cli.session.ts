import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import {
  CliSessionState,
  CliExecutionOptions,
  CliExecutionResult,
  CliOutputEvent,
} from '@monkagents/shared';
import { CliOutputParser } from './cli.parser';
import { v4 as uuidv4 } from 'uuid';

/**
 * Manages a single CLI session
 */
export class CliSession {
  private readonly logger: Logger;
  private readonly id: string;
  private readonly agentId: string;
  private process: ChildProcess | null = null;
  private parser: CliOutputParser;
  private state: CliSessionState;
  private options: CliExecutionOptions;
  private outputBuffer: string = '';
  private resolveExecution: ((result: CliExecutionResult) => void) | null = null;
  private rejectExecution: ((error: Error) => void) | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(agentId: string, options: CliExecutionOptions) {
    this.id = uuidv4();
    this.agentId = agentId;
    this.options = options;
    this.logger = new Logger(`CliSession:${this.id.substring(0, 8)}`);
    this.parser = new CliOutputParser();
    this.state = {
      id: this.id,
      agentId,
      status: 'starting',
      startedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    };
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }
  getId(): string {
    return this.id;
  }

  /**
   * Get session state
   */
  getState(): CliSessionState {
    return { ...this.state };
  }

  /**
   * Start CLI process with given configuration
   */
  async start(
    command: string,
    args: string[],
    workingDirectory: string,
  ): Promise<CliExecutionResult> {
    return new Promise((resolve, reject) => {
      this.resolveExecution = resolve;
      this.rejectExecution = reject;

      // Set timeout if specified
      if (this.options.timeout) {
        this.timeoutHandle = setTimeout(() => {
          this.handleError(new Error('Execution timeout'));
        }, this.options.timeout);
      }

      this.logger.debug(`Starting CLI: ${command} ${args.join(' ')}`);

      this.process = spawn(command, [...args, this.options.prompt], {
        cwd: workingDirectory || process.cwd(),
        shell: true,
        env: {
          ...process.env,
          // Pass through environment for API configuration
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || '',
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
          ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
        },
      });

      this.state.status = 'running';
      this.state.pid = this.process.pid || undefined;

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data);
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        this.handleStderr(data);
      });

      // Handle process close
      this.process.on('close', (code: number) => {
        this.handleClose(code);
      });

      // Handle process error
      this.process.on('error', (error: Error) => {
        this.handleError(error);
      });
    });
  }

  /**
   * Handle stdout data
   */
  private handleStdout(data: Buffer): void {
    this.state.lastActivity = new Date();
    const chunk = data.toString();
    this.outputBuffer += chunk;

    // Parse events from chunk
    const events = this.parser.parseChunk(chunk);

    // Process each event
    for (const event of events) {
      this.handleEvent(event);
    }
  }

  /**
   * Handle stderr data
   */
  private handleStderr(data: Buffer): void {
    const text = data.toString();
    this.logger.warn(`CLI stderr: ${text}`);
    // Some useful info might come through stderr
    this.options.onError?.(text);
  }

  /**
   * Handle parsed CLI event
   */
  private handleEvent(event: CliOutputEvent): void {
    this.state.messageCount++;
    this.state.lastActivity = new Date();

    // Update session ID if received
    if (event.sessionId) {
      this.state.id = event.sessionId;
    }

    // Call appropriate callback
    this.options.onStream?.(event);

    switch (event.type) {
      case 'init':
        this.logger.debug(`Session initialized: ${event.sessionId}`);
        this.options.onInit?.(event.sessionId || this.id);
        break;

      case 'text':
        this.options.onText?.(event.content || '');
        break;

      case 'tool_use':
        this.options.onToolUse?.(event.toolName || '', event.toolInput || {});
        break;

      case 'tool_result':
        this.options.onToolResult?.(event.toolResult);
        break;

      case 'complete':
        this.handleComplete(event);
        break;

      case 'error':
        this.options.onError?.(event.error || 'Unknown error');
        break;
    }
  }

  /**
   * Handle completion event
   */
  private handleComplete(event: CliOutputEvent): void {
    this.state.status = 'idle';

    // Update token usage if available
    if (event.metadata?.tokensUsed) {
      this.state.tokenUsage = {
        input: 0,
        output: event.metadata.tokensUsed as number,
      };
    }

    const result: CliExecutionResult = {
      success: true,
      sessionId: this.state.id,
      output: event.content || this.outputBuffer,
      tokensUsed: this.state.tokenUsage,
      durationMs: event.metadata?.durationMs as number,
      costUsd: event.metadata?.costUsd as number,
    };

    this.options.onComplete?.({
      type: 'result',
      subtype: 'success',
      session_id: this.state.id,
      result: result.output,
    } as any);

    this.cleanup();
    this.resolveExecution?.(result);
  }

  /**
   * Handle process close
   */
  private handleClose(code: number): void {
    this.logger.debug(`Process closed with code: ${code}`);

    // Flush remaining buffer
    const remainingEvents = this.parser.flush();
    for (const event of remainingEvents) {
      this.handleEvent(event);
    }

    if (code !== 0 && this.state.status === 'running') {
      // Process exited with error before completion
      const result: CliExecutionResult = {
        success: false,
        sessionId: this.state.id,
        error: `Process exited with code ${code}`,
        output: this.outputBuffer,
      };
      this.cleanup();
      this.resolveExecution?.(result);
    }

    this.state.status = 'closed';
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    this.logger.error(`CLI error: ${error.message}`);
    this.state.status = 'error';
    this.cleanup();
    this.rejectExecution?.(error);
    this.options.onError?.(error.message);
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    if (this.process && this.state.status === 'running') {
      this.logger.log('Cancelling execution');
      this.process.kill('SIGTERM');
      this.state.status = 'closed';

      const result: CliExecutionResult = {
        success: false,
        sessionId: this.state.id,
        error: 'Cancelled by user',
        output: this.outputBuffer,
      };

      this.cleanup();
      this.resolveExecution?.(result);
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.process = null;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.state.status === 'running' || this.state.status === 'starting';
  }
}