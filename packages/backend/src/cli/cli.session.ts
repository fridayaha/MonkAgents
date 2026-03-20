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
 * Configuration for CLI session
 */
const DEFAULT_CONFIG = {
  timeoutMs: 30 * 60 * 1000,        // 30 minutes default timeout
  activityCheckInterval: 10000,      // Check activity every 10 seconds
  gracefulShutdownMs: 5000,          // Wait 5 seconds after SIGTERM before SIGKILL
};

/**
 * Manages a single CLI session with robust lifecycle management
 * Based on minimal-claude.js patterns
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
  private stderrBuffer: string = '';
  private resolveExecution: ((result: CliExecutionResult) => void) | null = null;
  private rejectExecution: ((error: Error) => void) | null = null;

  // Activity tracking
  private lastActivity: number = Date.now();
  private activityCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

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

      // Start activity-based timeout check
      this.startActivityCheck();

      this.logger.debug(`Starting CLI: ${command} ${args.join(' ')}`);

      // Spawn process with shell: true for command flexibility
      this.process = spawn(command, [...args, this.options.prompt], {
        cwd: workingDirectory || process.cwd(),
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe'],  // inherit stdin, pipe stdout/stderr
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

      // Handle stdout - updates activity and parses events
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data);
      });

      // Handle stderr - also updates activity
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
   * Start activity-based timeout check
   * Unlike simple timeout, this only triggers if no activity for the duration
   */
  private startActivityCheck(): void {
    const timeoutMs = this.options.timeout || DEFAULT_CONFIG.timeoutMs;

    this.activityCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const idleTime = Date.now() - this.lastActivity;
      if (idleTime > timeoutMs) {
        this.logger.warn(`Timeout: ${timeoutMs / 60000} minutes without activity`);
        this.gracefulShutdown('timeout');
      }
    }, DEFAULT_CONFIG.activityCheckInterval);
  }

  /**
   * Update activity timestamp (called on any stdout/stderr data)
   */
  private updateActivity(): void {
    this.lastActivity = Date.now();
    this.state.lastActivity = new Date();
  }

  /**
   * Handle stdout data
   */
  private handleStdout(data: Buffer): void {
    this.updateActivity();
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
   * Handle stderr data - also updates activity
   */
  private handleStderr(data: Buffer): void {
    this.updateActivity();
    const text = data.toString();
    this.stderrBuffer += text;
    this.logger.debug(`CLI stderr: ${text.substring(0, 100)}...`);

    // Some useful info might come through stderr
    this.options.onError?.(text);
  }

  /**
   * Handle parsed CLI event
   */
  private handleEvent(event: CliOutputEvent): void {
    this.state.messageCount++;

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
   * Handle completion event from parser
   */
  private handleComplete(event: CliOutputEvent): void {
    this.state.status = 'completed';  // Mark as completed (not just idle)

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

    // Stop activity check
    this.stopActivityCheck();

    // Flush remaining buffer
    const remainingEvents = this.parser.flush();
    for (const event of remainingEvents) {
      this.handleEvent(event);
    }

    // Process buffer if still has data
    if (this.parser.getBuffer().trim()) {
      try {
        const message = JSON.parse(this.parser.getBuffer().trim());
        const events = this.parser.parseMessage(message);
        for (const event of events) {
          this.handleEvent(event);
        }
      } catch {
        // Ignore incomplete JSON
      }
    }

    // Only resolve if not already resolved (by complete event or error)
    if (this.state.status === 'running' || this.state.status === 'starting') {
      const result: CliExecutionResult = {
        success: code === 0,
        sessionId: this.state.id,
        output: this.outputBuffer,
        error: code !== 0 ? this.stderrBuffer || `Process exited with code ${code}` : undefined,
      };
      this.cleanup();
      this.resolveExecution?.(result);
    }

    this.state.status = 'closed';
    this.process = null;
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    this.logger.error(`CLI error: ${error.message}`);
    this.state.status = 'error';
    this.stopActivityCheck();
    this.cleanup();
    this.rejectExecution?.(error);
    this.options.onError?.(error.message);
  }

  /**
   * Graceful shutdown: SIGTERM first, then SIGKILL after grace period
   */
  private gracefulShutdown(reason: string): void {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.logger.log(`Initiating graceful shutdown: ${reason}`);
    this.stopActivityCheck();

    if (!this.process || !this.process.pid) {
      return;
    }

    // First try SIGTERM for graceful termination
    this.process.kill('SIGTERM');

    // Force kill after grace period
    const forceKillTimer = setTimeout(() => {
      if (this.process?.pid) {
        this.logger.warn('Force killing process after SIGTERM timeout');
        this.process.kill('SIGKILL');
      }
    }, DEFAULT_CONFIG.gracefulShutdownMs);

    // Ensure timer doesn't prevent process exit
    forceKillTimer.unref();

    // Resolve with cancellation result
    const result: CliExecutionResult = {
      success: false,
      sessionId: this.state.id,
      error: `Execution ${reason}`,
      output: this.outputBuffer,
    };

    this.cleanup();
    this.resolveExecution?.(result);
  }

  /**
   * Cancel execution (user-initiated)
   */
  cancel(): void {
    if (this.process && this.state.status === 'running') {
      this.gracefulShutdown('cancelled by user');
    }
  }

  /**
   * Stop activity check interval
   */
  private stopActivityCheck(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopActivityCheck();
    this.process = null;
    this.parser.reset();
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.state.status === 'running' || this.state.status === 'starting';
  }
}