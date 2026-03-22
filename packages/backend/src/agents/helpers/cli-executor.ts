import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  AgentConfig,
  CliExecutionResult,
  CliOutputEvent,
} from '@monkagents/shared';
import { CliOutputParser } from '../../cli/cli.parser';

/**
 * Configuration for CLI execution
 */
export interface CliExecutionConfig {
  timeoutMs: number;
  activityCheckInterval: number;
  gracefulShutdownMs: number;
  maxRetries?: number;
}

/**
 * Default configuration for CLI execution
 */
export const DEFAULT_CLI_EXECUTION_CONFIG: CliExecutionConfig = {
  timeoutMs: 30 * 60 * 1000,        // 30 minutes default timeout
  activityCheckInterval: 10000,      // Check activity every 10 seconds
  gracefulShutdownMs: 5000,          // Wait 5 seconds after SIGTERM before SIGKILL
  maxRetries: 1,                     // Number of retries on failure
};

/**
 * Helper class to manage CLI process execution
 */
export class CliExecutor {
  private readonly logger: Logger;
  private currentProcess: ChildProcess | null = null;
  private parser: CliOutputParser;
  private isShuttingDown: boolean = false;
  private retryCount: number = 0;

  // Activity tracking
  private lastActivity: number = Date.now();
  private activityCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: AgentConfig,
    private executionConfig: CliExecutionConfig = DEFAULT_CLI_EXECUTION_CONFIG,
  ) {
    this.logger = new Logger(`${config.name}CliExecutor`);
    this.parser = new CliOutputParser();
  }

  async execute(
    fullPrompt: string,
    workingDirectory: string,
    onEvent: (event: CliOutputEvent) => void,
  ): Promise<CliExecutionResult> {
    // Resolve working directory to absolute path
    let effectiveWorkingDir = workingDirectory;
    if (!path.isAbsolute(effectiveWorkingDir)) {
      effectiveWorkingDir = path.resolve(process.cwd(), effectiveWorkingDir);
    }

    // Ensure working directory exists, otherwise fall back to cwd
    if (!fs.existsSync(effectiveWorkingDir)) {
      this.logger.warn(`Working directory does not exist: ${effectiveWorkingDir}, using current directory: ${process.cwd()}`);
      effectiveWorkingDir = process.cwd();
    }

    this.logger.log(`Executing task in: ${effectiveWorkingDir}`);

    this.isShuttingDown = false;
    this.lastActivity = Date.now();
    this.retryCount = 0;

    return new Promise((resolve, reject) => {
      this.executeWithRetry(resolve, reject, fullPrompt, effectiveWorkingDir, onEvent);
    });
  }

  private executeWithRetry(
    resolve: (value: CliExecutionResult) => void,
    reject: (reason: any) => void,
    fullPrompt: string,
    effectiveWorkingDir: string,
    onEvent: (event: CliOutputEvent) => void,
  ): void {
    // Determine the correct claude executable path
    let actualCommand = this.config.cli.command;
    if (process.platform === 'win32' && actualCommand === 'claude') {
      // On Windows, prefer the official installation path (.local/bin/claude.exe)
      const localBin = path.join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe');
      const npmClaude = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');

      // Check which one exists
      if (fs.existsSync(localBin)) {
        actualCommand = localBin;
      } else if (fs.existsSync(npmClaude)) {
        actualCommand = npmClaude;
      }
    }

    const args = this.buildCliArgs();
    this.logger.debug(`Starting CLI: ${actualCommand} ${args.join(' ')} [prompt via stdin]`);

    // Prepare environment - remove CLAUDECODE vars to allow nested execution
    const env: Record<string, string> = {};
    Object.keys(process.env).forEach(key => {
      if (!key.startsWith('CLAUDECODE') && !key.startsWith('CLAUDE_CODE')) {
        env[key] = process.env[key] || '';
      }
    });

    this.currentProcess = spawn(actualCommand, args, {
      cwd: effectiveWorkingDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],  // pipe stdin to send prompt
      shell: false,  // Don't use shell when we have the exact path
    });

    // Write prompt to stdin for better handling of multi-line content
    if (this.currentProcess.stdin) {
      this.currentProcess.stdin.write(fullPrompt);
      this.currentProcess.stdin.end();
    }

    let output = '';
    let error = '';
    let sessionIdFromCli: string | undefined;

    // Handle stdout - updates activity and parses events
    this.currentProcess.stdout?.on('data', (data: Buffer) => {
      this.updateActivity();
      const chunk = data.toString();
      output += chunk;

      // Parse events
      const events = this.parser.parseChunk(chunk);
      for (const event of events) {
        onEvent(event);

        if (event.sessionId) {
          sessionIdFromCli = event.sessionId;
        }
      }
    });

    // Handle stderr - also updates activity
    this.currentProcess.stderr?.on('data', (data: Buffer) => {
      this.updateActivity();
      const text = data.toString();
      error += text;
      // Filter out noise logs
      if (!text.includes('[TAIL]') && !text.includes('[WATCH]')) {
        this.logger.debug(`CLI stderr: ${text.substring(0, 100)}...`);
      }
    });

    // Handle process close
    this.currentProcess.on('close', (code: number) => {
      this.handleProcessClose(code, output, error, sessionIdFromCli, resolve, reject, fullPrompt, effectiveWorkingDir, onEvent);
    });

    // Handle process error
    this.currentProcess.on('error', (err: Error) => {
      this.handleProcessError(err, reject);
    });
  }

  private handleProcessClose(
    code: number,
    output: string,
    error: string,
    sessionIdFromCli: string | undefined,
    resolve: (value: CliExecutionResult) => void,
    reject: (reason: any) => void,
    fullPrompt: string,
    effectiveWorkingDir: string,
    onEvent: (event: CliOutputEvent) => void,
  ): void {
    this.stopActivityCheck();
    this.currentProcess = null;

    // Flush remaining output
    const remainingEvents = this.parser.flush();
    for (const event of remainingEvents) {
      onEvent(event);
    }

    // Process remaining buffer
    if (this.parser.getBuffer().trim()) {
      try {
        const message = JSON.parse(this.parser.getBuffer().trim());
        const events = this.parser.parseMessage(message);
        for (const event of events) {
          onEvent(event);
        }
      } catch {
        // Ignore incomplete JSON
      }
    }

    const result: CliExecutionResult = {
      success: code === 0,
      sessionId: sessionIdFromCli,
      output,
      error: code !== 0 ? error || `Process exited with code ${code}` : undefined,
    };

    if (code === 0) {
      this.parser.reset();
      resolve(result);
    } else {
      // Retry logic
      if (this.retryCount < (this.executionConfig.maxRetries || 0)) {
        this.retryCount++;
        this.logger.log(`Retrying execution (${this.retryCount}/${this.executionConfig.maxRetries})...`);
        setTimeout(() => {
          this.executeWithRetry(resolve, reject, fullPrompt, effectiveWorkingDir, onEvent);
        }, 1000); // 1 second delay before retry
      } else {
        this.parser.reset();
        reject(new Error(result.error));
      }
    }
  }

  private handleProcessError(err: Error, reject: (reason: any) => void): void {
    this.stopActivityCheck();
    this.currentProcess = null;
    this.logger.error(`CLI error: ${err.message}`);
    reject(err);
  }

  /**
   * Start activity-based timeout check
   */
  startActivityCheck(): void {
    this.activityCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const idleTime = Date.now() - this.lastActivity;
      if (idleTime > this.executionConfig.timeoutMs) {
        this.logger.warn(`Timeout: ${this.executionConfig.timeoutMs / 60000} minutes without activity`);
        this.gracefulShutdown('timeout');
      }
    }, this.executionConfig.activityCheckInterval);
  }

  /**
   * Stop activity check interval
   */
  stopActivityCheck(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
  }

  /**
   * Update activity timestamp
   */
  updateActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Graceful shutdown: SIGTERM first, then SIGKILL after grace period
   */
  gracefulShutdown(reason: string): void {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.logger.log(`Initiating graceful shutdown: ${reason}`);
    this.stopActivityCheck();

    if (!this.currentProcess || !this.currentProcess.pid) {
      return;
    }

    // First try SIGTERM for graceful termination
    this.currentProcess.kill('SIGTERM');

    // Force kill after grace period
    const forceKillTimer = setTimeout(() => {
      if (this.currentProcess?.pid) {
        this.logger.warn('Force killing process after SIGTERM timeout');
        this.currentProcess.kill('SIGKILL');
      }
    }, this.executionConfig.gracefulShutdownMs);

    // Ensure timer doesn't prevent process exit
    forceKillTimer.unref();
  }

  /**
   * Build CLI arguments based on configuration
   * Prompt will be sent via stdin
   */
  private buildCliArgs(): string[] {
    const baseArgs = [...this.config.cli.args];

    // Add permission mode if configured
    if (this.config.permissionMode && this.config.permissionMode !== 'default') {
      baseArgs.push('--permission-mode', this.config.permissionMode);
    }

    // Add max turns if configured
    if (this.config.maxTurns) {
      baseArgs.push('--max-turns', String(this.config.maxTurns));
    }

    // Add tools configuration
    if (this.config.disallowedTools && this.config.disallowedTools.length > 0) {
      baseArgs.push('--disallowedTools', this.config.disallowedTools.join(','));
    }

    // Note: Prompt will be sent via stdin, not as argument
    return baseArgs;
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.currentProcess) {
      this.logger.log('Cancelling execution');
      this.isShuttingDown = true;
      this.stopActivityCheck();

      // SIGTERM first
      this.currentProcess.kill('SIGTERM');

      // Force kill after grace period
      setTimeout(() => {
        if (this.currentProcess?.pid) {
          this.currentProcess.kill('SIGKILL');
        }
      }, this.executionConfig.gracefulShutdownMs);

      this.currentProcess = null;
      this.parser.reset();
    }
  }

  /**
   * Check if currently executing
   */
  isExecuting(): boolean {
    return !!this.currentProcess;
  }
}