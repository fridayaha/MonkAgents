import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  CliSessionState,
  CliExecutionOptions,
  CliExecutionResult,
  CliOutputEvent,
} from '@monkagents/shared';
import { CliSession } from './cli.session';

/**
 * Service for managing CLI sessions and executions
 */
@Injectable()
export class CliService implements OnModuleDestroy {
  private readonly logger = new Logger(CliService.name);
  private sessions: Map<string, CliSession> = new Map();
  private agentSessions: Map<string, string> = new Map(); // agentId -> sessionId

  constructor(private readonly configService: ConfigService) {}

  /**
   * Execute a prompt using CLI
   */
  async execute(
    agentId: string,
    prompt: string,
    options: Partial<CliExecutionOptions> = {},
  ): Promise<CliExecutionResult> {
    // Get agent configuration
    const agentConfig = this.configService.getAgentConfig(agentId);
    if (!agentConfig) {
      throw new Error(`Agent configuration not found: ${agentId}`);
    }

    // Cancel existing session for this agent if running
    const existingSessionId = this.agentSessions.get(agentId);
    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession?.isActive()) {
        this.logger.log(`Cancelling existing session for agent: ${agentId}`);
        existingSession.cancel();
      }
    }

    // Create execution options
    const execOptions: CliExecutionOptions = {
      prompt,
      workingDirectory: options.workingDirectory || process.cwd(),
      timeout: options.timeout || 300000, // 5 minutes default
      ...options,
    };

    // Create new session
    const session = new CliSession(agentId, execOptions);
    const sessionId = session.getId();

    this.sessions.set(sessionId, session);
    this.agentSessions.set(agentId, sessionId);

    this.logger.log(`Starting CLI execution for agent: ${agentId}`);

    try {
      const result = await session.start(
        agentConfig.cli.command,
        agentConfig.cli.args,
        execOptions.workingDirectory || process.cwd(),
      );

      return result;
    } finally {
      // Clean up session after completion
      this.sessions.delete(sessionId);
      if (this.agentSessions.get(agentId) === sessionId) {
        this.agentSessions.delete(agentId);
      }
    }
  }

  /**
   * Execute with streaming callbacks
   */
  async executeWithStream(
    agentId: string,
    prompt: string,
    callbacks: {
      onInit?: (sessionId: string) => void;
      onText?: (text: string) => void;
      onToolUse?: (name: string, input: Record<string, unknown>) => void;
      onToolResult?: (result: unknown) => void;
      onError?: (error: string) => void;
      onStream?: (event: CliOutputEvent) => void;
    },
    options: Partial<CliExecutionOptions> = {},
  ): Promise<CliExecutionResult> {
    return this.execute(agentId, prompt, {
      ...options,
      ...callbacks,
    });
  }

  /**
   * Cancel execution for an agent
   */
  cancel(agentId: string): boolean {
    const sessionId = this.agentSessions.get(agentId);
    if (!sessionId) return false;

    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.cancel();
    return true;
  }

  /**
   * Get session state
   */
  getSessionState(sessionId: string): CliSessionState | null {
    const session = this.sessions.get(sessionId);
    return session ? session.getState() : null;
  }

  /**
   * Get active session for agent
   */
  getAgentSession(agentId: string): CliSessionState | null {
    const sessionId = this.agentSessions.get(agentId);
    if (!sessionId) return null;
    return this.getSessionState(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): CliSessionState[] {
    const activeSessions: CliSessionState[] = [];
    for (const session of this.sessions.values()) {
      if (session.isActive()) {
        activeSessions.push(session.getState());
      }
    }
    return activeSessions;
  }

  /**
   * Check if agent is currently executing
   */
  isAgentExecuting(agentId: string): boolean {
    const sessionId = this.agentSessions.get(agentId);
    if (!sessionId) return false;

    const session = this.sessions.get(sessionId);
    return session?.isActive() || false;
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    this.logger.log('Cleaning up CLI sessions...');

    for (const session of this.sessions.values()) {
      if (session.isActive()) {
        session.cancel();
      }
    }

    this.sessions.clear();
    this.agentSessions.clear();
  }
}