import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentConfig } from '@monkagents/shared';
import { ExecutableAgentBase } from './executable-agent-base';

/**
 * Abstract base class for individual agent implementations
 * Provides common functionality and lifecycle hooks
 */
@Injectable()
export abstract class BaseAgentService extends ExecutableAgentBase implements OnModuleInit {
  constructor(config: AgentConfig) {
    super(config);
  }

  async onModuleInit() {
    // Default implementation - can be overridden by subclasses
    this.logger.log(`${this.getName()} initialized`);
  }

  /**
   * Initialize the agent with configuration
   * @param config Agent configuration
   */
  protected initialize(config: AgentConfig): void {
    this.initializeAgent(config); // Call the parent's new initialization method
    (this.logger as any).context = `${config.name}Agent`;
  }

  /**
   * Hook called before executing a task
   * Can be overridden by subclasses for pre-execution logic
   */
  protected async beforeExecute(): Promise<void> {
    // Default implementation - no-op
  }

  /**
   * Hook called after executing a task
   * Can be overridden by subclasses for post-execution cleanup
   */
  protected async afterExecute(): Promise<void> {
    // Default implementation - no-op
  }
}