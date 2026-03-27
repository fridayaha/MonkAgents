import { Logger } from '@nestjs/common';
import { AgentConfig, CliExecutionResult, ExecutionSummary } from '@monkagents/shared';
import { ExecutableAgentBase, AgentExecutionContext } from '../agents/executable-agent-base';
import {
  TeamTask,
  TeamMemberStatus,
  MailboxMessage,
  HandoffPayload,
  TeamTaskResult,
} from './interfaces';
import { TaskListService } from './task-list.service';
import { MailboxService } from './mailbox.service';
import { TeamManager } from './team.manager';

/**
 * Teammate agent run state
 */
interface TeammateState {
  teamId: string;
  status: 'idle' | 'working';
  currentTask: TeamTask | null;
  shouldStop: boolean;
}

/**
 * TeammateAgent - Base class for all worker agents
 *
 * Extends ExecutableAgentBase with:
 * - Independent run loop for task claiming
 * - Inter-agent communication via Mailbox
 * - Handoff support for task delegation
 */
export abstract class TeammateAgent extends ExecutableAgentBase {
  protected readonly teammateLogger: Logger;

  /** Task list service for claiming tasks */
  protected taskListService: TaskListService | null = null;

  /** Mailbox service for communication */
  protected mailboxService: MailboxService | null = null;

  /** Team manager reference */
  protected teamManager: TeamManager | null = null;

  /** Current run state */
  private state: TeammateState = {
    teamId: '',
    status: 'idle',
    currentTask: null,
    shouldStop: false,
  };

  /** Check interval for task polling (ms) */
  protected readonly pollIntervalMs = 1000;

  /** Maximum consecutive errors before stopping */
  protected readonly maxConsecutiveErrors = 3;

  constructor(config: AgentConfig) {
    super(config);
    this.teammateLogger = new Logger(`${config.name}Teammate`);
  }

  /**
   * Set team services
   */
  setTeamServices(
    taskListService: TaskListService,
    mailboxService: MailboxService,
    teamManager: TeamManager,
  ): void {
    this.taskListService = taskListService;
    this.mailboxService = mailboxService;
    this.teamManager = teamManager;

    // Register message handler
    this.mailboxService.registerHandler(this.getId(), (msg) => this.handleMailboxMessage(msg));
  }

  /**
   * Main run loop - continuously claims and executes tasks
   */
  async run(teamId: string, signal: AbortSignal): Promise<void> {
    this.teammateLogger.log(`${this.getName()} starting run loop for team ${teamId}`);

    this.state = {
      teamId,
      status: 'idle',
      currentTask: null,
      shouldStop: false,
    };

    // Subscribe to mailbox
    if (this.mailboxService) {
      await this.mailboxService.subscribeAgent(teamId, this.getId());
    }

    // Update status to idle
    this.updateMemberStatus('idle');

    let consecutiveErrors = 0;

    while (!signal.aborted && !this.state.shouldStop) {
      try {
        // Check for mailbox messages
        this.processMailboxMessages();

        // Try to claim a task
        const claimResult = await this.claimTask();

        if (claimResult.success && claimResult.task) {
          // Reset error counter on successful claim
          consecutiveErrors = 0;

          // Execute the task
          await this.executeTask(claimResult.task);
        } else {
          // No task available, check if team is complete
          if (this.isTeamComplete()) {
            this.teammateLogger.log(`${this.getName()}: All tasks complete, exiting`);
            break;
          }

          // Wait before next poll
          await this.sleep(this.pollIntervalMs);
        }
      } catch (error) {
        consecutiveErrors++;
        this.teammateLogger.error(`${this.getName()} run loop error (${consecutiveErrors}): ${error}`);

        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          this.teammateLogger.error(`${this.getName()}: Too many consecutive errors, stopping`);
          break;
        }

        // Wait before retry
        await this.sleep(this.pollIntervalMs * 2);
      }
    }

    // Update status to offline
    this.updateMemberStatus('offline');

    // Unsubscribe from mailbox
    if (this.mailboxService) {
      await this.mailboxService.unsubscribeAgent(teamId, this.getId());
    }

    this.teammateLogger.log(`${this.getName()} run loop ended`);
  }

  /**
   * Try to claim an available task
   */
  private async claimTask(): Promise<{ success: boolean; task?: TeamTask }> {
    if (!this.taskListService) {
      return { success: false };
    }

    const result = await this.taskListService.claimTask(
      this.state.teamId,
      this.getId(),
    );

    if (result.success && result.task) {
      this.state.currentTask = result.task;
      this.teammateLogger.log(`${this.getName()} claimed task: ${result.task.subject}`);
    }

    return result;
  }

  /**
   * Execute a claimed task
   */
  private async executeTask(task: TeamTask): Promise<void> {
    this.state.status = 'working';
    this.updateMemberStatus('working', task.id);

    const startTime = Date.now();

    try {
      // Build execution context
      const context = await this.buildExecutionContext(task);

      // Execute via CLI
      const result = await this.execute(context);

      // Convert CliExecutionResult to TaskResult
      const taskResult: TeamTaskResult = this.convertToTaskResult(result);

      // Complete the task
      if (this.taskListService) {
        await this.taskListService.completeTask(task.id, taskResult);
      }

      // Increment completed count
      if (this.teamManager) {
        this.teamManager.incrementMemberTasksCompleted(this.state.teamId, this.getId());
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.teammateLogger.log(
        `${this.getName()} completed task "${task.subject}" in ${duration}s`
      );

      // Check for handoff suggestions
      if (result.executionSummary?.suggestions?.length) {
        await this.handleHandoffSuggestions(task, result.executionSummary);
      }
    } catch (error) {
      this.teammateLogger.error(`${this.getName()} task execution failed: ${error}`);

      // Mark task as failed
      if (this.taskListService) {
        await this.taskListService.failTask(task.id, String(error));
      }
    } finally {
      this.state.status = 'idle';
      this.state.currentTask = null;
      this.updateMemberStatus('idle');
    }
  }

  /**
   * Build execution context from task
   */
  protected async buildExecutionContext(task: TeamTask): Promise<AgentExecutionContext> {
    // Get team working directory
    let workingDirectory = process.cwd();
    if (this.teamManager) {
      const team = this.teamManager.getTeam(this.state.teamId);
      if (team) {
        workingDirectory = team.workingDirectory;
      }
    }

    // Get previous task results for context
    const previousSummaries: ExecutionSummary[] = [];
    if (this.taskListService) {
      const teamTasks = this.taskListService.getTeamTasks(this.state.teamId);
      for (const t of teamTasks) {
        if (t.status === 'completed' && t.result && t.id !== task.id) {
          // Convert TaskResult to ExecutionSummary format
          const summary: ExecutionSummary = {
            status: t.result.status,
            filesChanged: (t.result.filesChanged || []).map(f => ({
              path: f.path,
              action: f.action,
              summary: f.summary,
            })),
            outputs: [],
            duration: 0,
          };
          previousSummaries.push(summary);
        }
      }
    }

    return {
      sessionId: this.state.teamId,
      taskId: this.state.teamId,
      subtaskId: task.id,
      workingDirectory,
      sessionWorkingDirectory: workingDirectory,
      prompt: `${task.subject}\n\n${task.description}`,
      previousSummaries,
    };
  }

  /**
   * Convert CLI execution result to task result
   */
  private convertToTaskResult(result: CliExecutionResult): TeamTaskResult {
    const taskResult: TeamTaskResult = {
      status: result.success ? 'completed' : 'failed',
      outputs: [],
    };

    if (result.executionSummary) {
      taskResult.filesChanged = result.executionSummary.filesChanged?.map(f => ({
        path: f.path,
        action: f.action,
        summary: f.summary,
      }));
      taskResult.outputs = result.executionSummary.outputs?.map(o => ({
        type: o.type,
        description: o.description,
        value: o.value,
        filePath: o.filePath,
      }));
    }

    if (!result.success && result.error) {
      taskResult.error = result.error;
    }

    return taskResult;
  }

  /**
   * Handle handoff suggestions from execution summary
   */
  private async handleHandoffSuggestions(
    task: TeamTask,
    summary: ExecutionSummary,
  ): Promise<void> {
    for (const suggestion of summary.suggestions || []) {
      if (suggestion.targetAgent === 'tangseng') {
        // Don't handoff to coordinator
        continue;
      }

      this.teammateLogger.log(
        `${this.getName()} suggesting handoff to ${suggestion.targetAgent}: ${suggestion.task}`
      );

      // Create a new task for the target agent
      if (this.taskListService) {
        await this.taskListService.createTask({
          teamId: this.state.teamId,
          subject: suggestion.task,
          description: suggestion.reason,
          assignedTo: suggestion.targetAgent,
          priority: suggestion.priority,
          blockedBy: [task.id], // This task depends on the completed one
        });
      }

      // Send handoff message
      if (this.mailboxService) {
        const payload: HandoffPayload = {
          taskId: task.id,
          targetAgent: suggestion.targetAgent,
          task: suggestion.task,
          reason: suggestion.reason,
          context: this.convertToTaskResult({ success: true, executionSummary: summary } as CliExecutionResult),
        };

        await this.mailboxService.sendMessage(
          this.state.teamId,
          this.getId(),
          suggestion.targetAgent,
          'handoff',
          payload,
        );
      }
    }
  }

  /**
   * Handle incoming mailbox message
   */
  protected async handleMailboxMessage(message: MailboxMessage): Promise<void> {
    this.teammateLogger.debug(`${this.getName()} received message: ${message.type}`);

    switch (message.type) {
      case 'handoff':
        await this.handleHandoff(message.payload as HandoffPayload);
        break;
      case 'notification':
        // Handle notification (e.g., log it)
        this.teammateLogger.log(`Notification: ${JSON.stringify(message.payload)}`);
        break;
      case 'task_update':
        // Task status update from another agent
        this.teammateLogger.debug(`Task update: ${JSON.stringify(message.payload)}`);
        break;
    }
  }

  /**
   * Handle handoff from another agent
   */
  protected async handleHandoff(payload: HandoffPayload): Promise<void> {
    this.teammateLogger.log(
      `${this.getName()} received handoff from ${payload.targetAgent}: ${payload.task}`
    );

    // The task should already be created by the sender
    // Just acknowledge receipt
  }

  /**
   * Process pending mailbox messages
   */
  private processMailboxMessages(): void {
    if (!this.mailboxService) return;

    const messages = this.mailboxService.getPendingMessages(this.getId());
    for (const message of messages) {
      this.handleMailboxMessage(message).catch(err => {
        this.teammateLogger.error(`Error handling message: ${err}`);
      });
    }
  }

  /**
   * Update member status in team manager
   */
  private updateMemberStatus(status: TeamMemberStatus, taskId?: string): void {
    if (this.teamManager) {
      this.teamManager.updateMemberStatus(
        this.state.teamId,
        this.getId(),
        status,
        taskId,
      );
    }
  }

  /**
   * Check if team execution is complete
   */
  private isTeamComplete(): boolean {
    if (!this.taskListService) return true;
    return this.taskListService.isTeamComplete(this.state.teamId);
  }

  /**
   * Stop the run loop
   */
  stop(): void {
    this.state.shouldStop = true;
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}