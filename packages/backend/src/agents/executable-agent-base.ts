import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
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
  /** 会话配置的工作目录（用户指定的项目根目录） */
  sessionWorkingDirectory?: string;
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
 * Default configuration for CLI execution
 */
const DEFAULT_CONFIG = {
  timeoutMs: 30 * 60 * 1000,        // 30 minutes default timeout
  activityCheckInterval: 10000,      // Check activity every 10 seconds
  gracefulShutdownMs: 5000,          // Wait 5 seconds after SIGTERM before SIGKILL
};

/**
 * Base class for executable agents that can run CLI commands
 * All behavior is driven by configuration - no hardcoded task matching
 *
 * 参考: https://code.claude.com/docs/zh-CN/sub-agents
 */
export abstract class ExecutableAgentBase {
  protected readonly logger: Logger;
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected currentProcess: ChildProcess | null = null;
  protected parser: CliOutputParser;
  protected wsService: WebSocketService | null = null;

  // Activity tracking
  protected lastActivity: number = Date.now();
  protected activityCheckInterval: NodeJS.Timeout | null = null;
  protected isShuttingDown: boolean = false;
  protected timeoutMs: number = DEFAULT_CONFIG.timeoutMs;

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
   * Set timeout duration (in milliseconds)
   */
  setTimeout(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
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
   * Build CLI arguments based on configuration
   * Prompt will be sent via stdin
   */
  protected buildCliArgs(): string[] {
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
    if (this.config.tools && this.config.tools.length > 0) {
      // Tools are allowed by default, no need to specify
    }

    if (this.config.disallowedTools && this.config.disallowedTools.length > 0) {
      baseArgs.push('--disallowedTools', this.config.disallowedTools.join(','));
    }

    // Note: Prompt will be sent via stdin, not as argument
    return baseArgs;
  }

  /**
   * Execute a task using CLI
   * Optimized based on spawnClaudeAgent pattern
   */
  async execute(
    context: AgentExecutionContext,
    callbacks?: AgentExecutionCallbacks,
  ): Promise<CliExecutionResult> {
    const { sessionId, workingDirectory, prompt, sessionWorkingDirectory } = context;

    // Resolve working directory to absolute path
    let effectiveWorkingDir = sessionWorkingDirectory || workingDirectory || process.cwd();
    if (!path.isAbsolute(effectiveWorkingDir)) {
      effectiveWorkingDir = path.resolve(process.cwd(), effectiveWorkingDir);
    }

    // Ensure working directory exists, otherwise fall back to cwd
    if (!fs.existsSync(effectiveWorkingDir)) {
      this.logger.warn(`工作目录不存在: ${effectiveWorkingDir}，使用当前目录: ${process.cwd()}`);
      effectiveWorkingDir = process.cwd();
    }

    this.logger.log(`执行任务: ${prompt.substring(0, 50)}...`);
    this.logger.debug(`工作目录: ${effectiveWorkingDir}`);

    this.status = 'executing';
    this.isShuttingDown = false;
    this.lastActivity = Date.now();

    // Broadcast status
    this.broadcastAgentStatus(sessionId, 'executing', '正在执行任务...');

    // Start activity-based timeout check
    this.startActivityCheck(sessionId, callbacks);

    return new Promise((resolve, reject) => {
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

      const fullPrompt = this.buildPrompt(prompt, context);
      const args = this.buildCliArgs();

      this.logger.debug(`Starting CLI: ${actualCommand} ${args.join(' ')} [prompt via stdin]`);

      // Prepare environment - remove CLAUDECODE vars to allow nested execution
      // This is critical for running Claude CLI inside Claude Code session
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
          this.handleCliEvent(sessionId, event, callbacks);

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
        this.handleProcessClose(sessionId, code, output, error, sessionIdFromCli, callbacks, resolve);
      });

      // Handle process error
      this.currentProcess.on('error', (err: Error) => {
        this.handleProcessError(sessionId, err, callbacks, reject);
      });
    });
  }

  /**
   * Start activity-based timeout check
   */
  protected startActivityCheck(
    sessionId: string,
    callbacks?: AgentExecutionCallbacks,
  ): void {
    this.activityCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const idleTime = Date.now() - this.lastActivity;
      if (idleTime > this.timeoutMs) {
        this.logger.warn(`Timeout: ${this.timeoutMs / 60000} minutes without activity`);
        this.gracefulShutdown(sessionId, 'timeout', callbacks);
      }
    }, DEFAULT_CONFIG.activityCheckInterval);
  }

  /**
   * Stop activity check interval
   */
  protected stopActivityCheck(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
  }

  /**
   * Update activity timestamp
   */
  protected updateActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Handle process close
   */
  protected handleProcessClose(
    sessionId: string,
    code: number,
    output: string,
    error: string,
    sessionIdFromCli: string | undefined,
    callbacks: AgentExecutionCallbacks | undefined,
    resolve: (result: CliExecutionResult) => void,
  ): void {
    this.stopActivityCheck();
    this.currentProcess = null;
    this.status = 'idle';

    // Flush remaining output
    const remainingEvents = this.parser.flush();
    for (const event of remainingEvents) {
      this.handleCliEvent(sessionId, event, callbacks);
    }

    // Process remaining buffer
    if (this.parser.getBuffer().trim()) {
      try {
        const message = JSON.parse(this.parser.getBuffer().trim());
        const events = this.parser.parseMessage(message);
        for (const event of events) {
          this.handleCliEvent(sessionId, event, callbacks);
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

    this.broadcastAgentStatus(sessionId, 'idle');

    if (code === 0) {
      callbacks?.onComplete?.(sessionId, result);
    } else {
      callbacks?.onError?.(sessionId, result.error || 'Execution failed');
    }

    this.parser.reset();
    resolve(result);
  }

  /**
   * Handle process error
   */
  protected handleProcessError(
    sessionId: string,
    err: Error,
    callbacks: AgentExecutionCallbacks | undefined,
    reject: (error: Error) => void,
  ): void {
    this.stopActivityCheck();
    this.currentProcess = null;
    this.status = 'idle';
    this.logger.error(`CLI error: ${err.message}`);

    callbacks?.onError?.(sessionId, err.message);
    this.broadcastAgentStatus(sessionId, 'idle');
    reject(err);
  }

  /**
   * Graceful shutdown: SIGTERM first, then SIGKILL after grace period
   */
  protected gracefulShutdown(
    sessionId: string,
    reason: string,
    callbacks?: AgentExecutionCallbacks,
  ): void {
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
    }, DEFAULT_CONFIG.gracefulShutdownMs);

    // Ensure timer doesn't prevent process exit
    forceKillTimer.unref();

    // Broadcast status
    this.broadcastAgentStatus(sessionId, 'idle');
    callbacks?.onError?.(sessionId, `Execution ${reason}`);
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
    if (this.currentProcess && this.status === 'executing') {
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
      }, DEFAULT_CONFIG.gracefulShutdownMs);

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