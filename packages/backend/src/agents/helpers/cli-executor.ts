import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  AgentConfig,
  CliExecutionResult,
  CliOutputEvent,
  PermissionDenial,
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
 * Options for CLI execution
 */
export interface CliExecutionOptions {
  /** Tools to auto-approve */
  allowedTools?: string[];
  /** CLI session ID to resume (for context persistence) */
  cliSessionId?: string;
  /** MCP configuration JSON string */
  mcpConfig?: string;
}

/**
 * Helper class to manage CLI process execution
 */
export class CliExecutor {
  private readonly logger: Logger;
  private currentProcess: ChildProcess | null = null;
  private parser: CliOutputParser;
  private isShuttingDown: boolean = false;
  private retryCount: number = 0;
  private currentOptions: CliExecutionOptions = {};

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

  /**
   * Set allowed tools for next execution
   */
  setAllowedTools(tools: string[]): void {
    this.currentOptions.allowedTools = tools;
  }

  /**
   * Set CLI session ID for resuming a previous session
   */
  setCliSessionId(cliSessionId: string | undefined): void {
    this.currentOptions.cliSessionId = cliSessionId;
  }

  /**
   * Set MCP configuration for next execution
   */
  setMcpConfig(mcpConfig: string | undefined): void {
    this.currentOptions.mcpConfig = mcpConfig;
  }

  async execute(
    fullPrompt: string,
    workingDirectory: string,
    onEvent: (event: CliOutputEvent) => void,
    options?: CliExecutionOptions,
  ): Promise<CliExecutionResult> {
    // Merge options
    if (options) {
      this.currentOptions = { ...this.currentOptions, ...options };
    }

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

    this.logger.debug(`CLI args: ${args.join(' ')}`);

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
    let permissionDenials: PermissionDenial[] = [];

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
    });

    // Handle process close
    this.currentProcess.on('close', (code: number) => {
      this.handleProcessClose(
        code, output, error, sessionIdFromCli, permissionDenials,
        resolve, reject, fullPrompt, effectiveWorkingDir, onEvent
      );
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
    permissionDenials: PermissionDenial[],
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

    // Parse permission_denials from output
    permissionDenials = this.parsePermissionDenials(output);

    const result: CliExecutionResult = {
      success: code === 0,
      sessionId: sessionIdFromCli,
      output,
      error: code !== 0 ? error || `Process exited with code ${code}` : undefined,
      permissionDenials,
    };

    if (code === 0) {
      this.parser.reset();
      resolve(result);
    } else {
      // Retry logic
      if (this.retryCount < (this.executionConfig.maxRetries || 0)) {
        this.retryCount++;
        this.logger.log(`Retrying execution (${this.retryCount}/${this.executionConfig.maxRetries})...`);

        // Clear CLI session ID on retry to start a fresh session
        // This prevents retrying with an invalid/expired session ID
        const previousSessionId = this.currentOptions.cliSessionId;
        if (previousSessionId) {
          this.logger.debug(`Clearing CLI session ID for retry (previous: ${previousSessionId})`);
          this.currentOptions.cliSessionId = undefined;
        }

        setTimeout(() => {
          this.executeWithRetry(resolve, reject, fullPrompt, effectiveWorkingDir, onEvent);
        }, 1000); // 1 second delay before retry
      } else {
        this.parser.reset();
        // Return result with permission denials instead of rejecting
        resolve(result);
      }
    }
  }

  /**
   * Parse permission_denials from CLI output
   */
  private parsePermissionDenials(output: string): PermissionDenial[] {
    const denials: PermissionDenial[] = [];

    try {
      // Look for permission_denials in the result message
      const lines = output.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'result' && msg.permission_denials) {
            denials.push(...msg.permission_denials);
          }
        } catch {
          // Not a JSON line, skip
        }
      }
    } catch (e) {
      this.logger.debug(`Error parsing permission denials: ${e}`);
    }

    if (denials.length > 0) {
      this.logger.log(`Found ${denials.length} permission denials`);
    }

    return denials;
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
   * Default tools that are disabled globally
   * WebSearch is disabled because it's not available in China
   */
  private static readonly DEFAULT_DISALLOWED_TOOLS = ['WebSearch'];

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

    // Merge default disallowed tools with config-specific ones
    // Default tools (like WebSearch) are always disabled for all agents
    const disallowedTools = new Set<string>(CliExecutor.DEFAULT_DISALLOWED_TOOLS);
    if (this.config.disallowedTools) {
      this.config.disallowedTools.forEach(tool => disallowedTools.add(tool));
    }

    // Add disallowed tools configuration
    if (disallowedTools.size > 0) {
      baseArgs.push('--disallowedTools', Array.from(disallowedTools).join(','));
    }

    // Add allowed tools for auto-approval
    if (this.currentOptions.allowedTools && this.currentOptions.allowedTools.length > 0) {
      baseArgs.push('--allowedTools', this.currentOptions.allowedTools.join(','));
    }

    // Add --resume for CLI session persistence
    if (this.currentOptions.cliSessionId) {
      baseArgs.push('--resume', this.currentOptions.cliSessionId);
    }

    // Add MCP configuration if provided
    if (this.currentOptions.mcpConfig) {
      this.logger.log(`Adding MCP config to CLI args`);
      baseArgs.push('--mcp-config', this.currentOptions.mcpConfig);
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