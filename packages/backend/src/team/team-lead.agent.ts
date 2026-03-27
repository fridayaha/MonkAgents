import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ExecutableAgentBase, AgentExecutionContext } from '../agents/executable-agent-base';
import { TeamManager } from './team.manager';
import { TaskListService } from './task-list.service';
import { MailboxService } from './mailbox.service';
import {
  Team,
  TeamTask,
  CreateTaskOptions,
  TeamTaskPriority,
} from './interfaces';

/**
 * Task plan from LLM planning
 */
interface TaskPlan {
  type: 'task' | 'chat' | 'help';
  analysis: string;
  steps: PlannedStep[];
  summary?: string;
}

interface PlannedStep {
  stepId: number;
  taskName: string;
  taskDetail: string;
  agentRole: string;
  priority: 'high' | 'medium' | 'low';
  dependencies: number[];
}

/**
 * TeamLeadAgent (唐僧)
 *
 * Responsibilities:
 * - Receive user requests
 * - Create Team and spawn Teammates
 * - Plan tasks via LLM
 * - Monitor team execution
 * - Integrate results
 */
@Injectable()
export class TeamLeadAgent extends ExecutableAgentBase implements OnModuleInit {
  private readonly leadLogger = new Logger(TeamLeadAgent.name);

  /** Team manager */
  private teamManager: TeamManager | null = null;

  /** Task list service */
  private taskListService: TaskListService | null = null;

  /** Mailbox service */
  protected _mailboxService: MailboxService | null = null;

  /** WebSocket service */
  protected wsService: any = null;

  /** Task planner (from original TangsengAgent) */
  private taskPlanner: any = null;

  /** Active teams by session ID */
  private activeTeamsBySession: Map<string, Team> = new Map();

  constructor(private readonly configService: any) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    const config = this.configService.getAgentConfig?.('tangseng');
    if (config) {
      this.initializeAgent(config);
    }
    this.leadLogger.log('TeamLeadAgent initialized');
  }

  /**
   * Set dependencies
   */
  setDependencies(
    teamManager: TeamManager,
    taskListService: TaskListService,
    mailboxService: MailboxService,
    wsService: any,
    taskPlanner?: any,
  ): void {
    this.teamManager = teamManager;
    this.taskListService = taskListService;
    this._mailboxService = mailboxService;
    this.wsService = wsService;
    this.taskPlanner = taskPlanner;

    // Set dependencies in team manager
    teamManager.setDependencies(taskListService, mailboxService, wsService);
  }

  /**
   * Process a user message - main entry point
   */
  async processUserMessage(
    sessionId: string,
    userPrompt: string,
    workingDirectory?: string,
  ): Promise<Team | null> {
    this.leadLogger.log(`Processing message: ${userPrompt.substring(0, 50)}...`);
    this.status = 'thinking';

    try {
      // Get working directory
      const workDir = workingDirectory || process.cwd();

      // 1. Plan the tasks using the existing task planner
      const plan = await this.planTasks(userPrompt, workDir);

      // 2. Handle different plan types
      if (plan.type === 'chat') {
        await this.handleChat(sessionId, userPrompt, plan);
        return null;
      }

      if (plan.type === 'help') {
        await this.handleHelp(sessionId, userPrompt, plan, workDir);
        return null;
      }

      // 3. Create team
      const team = await this.createTeam(sessionId, userPrompt, workDir);

      // 4. Create tasks from plan
      await this.createTasksFromPlan(team.id, plan);

      // 5. Broadcast plan to user
      this.broadcastPlan(sessionId, plan);

      // 6. Start team execution (non-blocking)
      this.startTeamExecution(team.id);

      this.status = 'idle';
      return team;
    } catch (error) {
      this.status = 'idle';
      this.leadLogger.error(`Failed to process message: ${error}`);
      throw error;
    }
  }

  /**
   * Plan tasks using LLM
   */
  private async planTasks(userPrompt: string, workingDirectory: string): Promise<TaskPlan> {
    // Use the existing task planner if available
    if (this.taskPlanner) {
      try {
        const result = await this.taskPlanner.planWithTangseng(userPrompt, workingDirectory);
        return {
          type: result.type || 'task',
          analysis: result.analysis || '',
          steps: result.steps?.map((step: any, index: number) => ({
            stepId: step.stepId || index + 1,
            taskName: step.taskName || `Task ${index + 1}`,
            taskDetail: step.taskDetail || step.description || '',
            agentRole: step.agentRole || 'wukong',
            priority: step.priority || 'medium',
            dependencies: step.dependencies || [],
          })) || [],
          summary: result.summary,
        };
      } catch (error) {
        this.leadLogger.error(`Task planning failed: ${error}`);
        // Fall through to simple planning
      }
    }

    // Simple fallback planning
    return {
      type: 'task',
      analysis: '简单任务规划',
      steps: [{
        stepId: 1,
        taskName: '执行任务',
        taskDetail: userPrompt,
        agentRole: 'wukong',
        priority: 'medium',
        dependencies: [],
      }],
    };
  }

  /**
   * Create a team
   */
  private async createTeam(
    sessionId: string,
    userPrompt: string,
    workingDirectory: string,
  ): Promise<Team> {
    if (!this.teamManager) {
      throw new Error('Team manager not initialized');
    }

    const team = await this.teamManager.createTeam({
      sessionId,
      userPrompt,
      workingDirectory,
    });

    this.activeTeamsBySession.set(sessionId, team);

    this.leadLogger.log(`Created team ${team.id} for session ${sessionId}`);

    return team;
  }

  /**
   * Create tasks from plan
   */
  private async createTasksFromPlan(teamId: string, plan: TaskPlan): Promise<TeamTask[]> {
    if (!this.taskListService) {
      throw new Error('Task list service not initialized');
    }

    const taskOptions: CreateTaskOptions[] = plan.steps.map(step => ({
      teamId,
      subject: step.taskName,
      description: step.taskDetail,
      assignedTo: step.agentRole,
      priority: step.priority as TeamTaskPriority,
      blockedBy: step.dependencies.length > 0
        ? plan.steps
            .filter((_, idx) => step.dependencies.includes(idx + 1))
            .map((_, idx) => `${teamId}-${idx + 1}`)
        : [],
    }));

    // First create all tasks without dependencies
    const tasks = await this.taskListService.createTasks(taskOptions);

    // Then update dependency references
    for (let i = 0; i < tasks.length; i++) {
      const step = plan.steps[i];
      if (step.dependencies.length > 0) {
        const blockedBy = step.dependencies.map(depIdx => tasks[depIdx - 1].id);
        // Update the task's blockedBy
        const task = tasks[i];
        task.blockedBy = blockedBy;
      }
    }

    this.leadLogger.log(`Created ${tasks.length} tasks for team ${teamId}`);

    return tasks;
  }

  /**
   * Start team execution (non-blocking)
   */
  private startTeamExecution(teamId: string): void {
    if (!this.teamManager) return;

    // Start team execution without waiting
    this.teamManager.startTeam(teamId).catch(error => {
      this.leadLogger.error(`Team execution error: ${error}`);
    });
  }

  /**
   * Handle chat mode
   */
  private async handleChat(
    sessionId: string,
    userPrompt: string,
    plan: TaskPlan,
  ): Promise<void> {
    // Broadcast thinking
    if (this.wsService) {
      this.wsService.emitAgentStatus('tangseng', 'thinking', 'thinking');
    }

    // Execute directly as a chat response
    const context: AgentExecutionContext = {
      sessionId,
      prompt: this.buildChatPrompt(userPrompt, plan),
      workingDirectory: process.cwd(),
      sessionWorkingDirectory: process.cwd(),
      taskId: 'chat',
      subtaskId: `chat-${Date.now()}`,
    };

    await this.execute(context);

    // Broadcast chat complete
    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: `chat-complete-${Date.now()}`,
        sessionId,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'chat_complete',
        content: '',
        createdAt: new Date(),
      });
    }
  }

  /**
   * Handle help mode
   */
  private async handleHelp(
    sessionId: string,
    userPrompt: string,
    plan: TaskPlan,
    workingDirectory: string,
  ): Promise<void> {
    // Broadcast that we're asking Rulai for help
    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: `msg-${Date.now()}-tangseng`,
        sessionId,
        sender: 'agent',
        senderId: 'tangseng',
        senderName: '唐僧',
        type: 'text',
        content: `阿弥陀佛...此任务颇为棘手，贫僧需请如来佛祖指点迷津。\n\n${plan.analysis}`,
        createdAt: new Date(),
      });
    }

    // Create a simple team with just Rulai
    const team = await this.createTeam(sessionId, userPrompt, workingDirectory);

    // Create a single task for Rulai
    if (this.taskListService) {
      await this.taskListService.createTask({
        teamId: team.id,
        subject: '指点迷津',
        description: `用户遇到棘手问题，请求指点:\n\n${userPrompt}\n\n分析: ${plan.analysis}`,
        assignedTo: 'rulai',
        priority: 'high',
      });
    }

    // Start team execution
    this.startTeamExecution(team.id);
  }

  /**
   * Build chat prompt
   */
  private buildChatPrompt(userPrompt: string, plan: TaskPlan): string {
    return `【闲聊任务】
用户发来一条消息，请以你的角色风格进行回复。

【用户消息】
${userPrompt}

【话题总结】
${plan.analysis}

【回复要求】
1. 用你独特的角色风格回复，保持人设一致
2. 回复要自然、生动，体现你的性格特点
3. 回复简洁，不要过长（建议2-5句话）
4. 不要输出 execution_summary，直接回复即可`;
  }

  /**
   * Broadcast plan to user
   */
  private broadcastPlan(sessionId: string, plan: TaskPlan): void {
    if (!this.wsService) return;

    const content = this.formatPlanMessage(plan);

    this.wsService.broadcastMessage(sessionId, {
      id: `plan-${Date.now()}`,
      sessionId,
      sender: 'agent',
      senderId: 'tangseng',
      senderName: '唐僧',
      type: 'text',
      content,
      createdAt: new Date(),
    });
  }

  /**
   * Format plan message for display
   */
  private formatPlanMessage(plan: TaskPlan): string {
    const lines = ['📋 **任务分解计划**\n'];

    for (const step of plan.steps) {
      const agentEmoji = this.getAgentEmojiById(step.agentRole);
      const deps = step.dependencies.length > 0
        ? ` (依赖: 步骤${step.dependencies.join(', ')})`
        : '';
      const priorityEmoji = step.priority === 'high' ? '🔴' : step.priority === 'low' ? '🟢' : '🟡';
      lines.push(`${step.stepId}. ${agentEmoji} **${step.taskName}**${deps}`);
      lines.push(`   ${priorityEmoji} ${step.taskDetail}`);
    }

    lines.push(`\n${plan.analysis}`);
    if (plan.summary) {
      lines.push(`\n${plan.summary}`);
    }

    return lines.join('\n');
  }

  /**
   * Get emoji for agent ID
   */
  private getAgentEmojiById(agentId: string): string {
    const emojis: Record<string, string> = {
      tangseng: '🧘',
      wukong: '🐵',
      bajie: '🐷',
      shaseng: '🧔',
      rulai: '🙏',
    };
    return emojis[agentId] || '🤖';
  }

  /**
   * Cancel a running team
   */
  async cancelTeam(sessionId: string): Promise<void> {
    const team = this.activeTeamsBySession.get(sessionId);
    if (team && this.teamManager) {
      await this.teamManager.cancelTeam(team.id);
      this.activeTeamsBySession.delete(sessionId);
    }
  }

  /**
   * Get team status for a session
   */
  getTeamStatus(sessionId: string): Team | undefined {
    return this.activeTeamsBySession.get(sessionId);
  }

  /**
   * Execute task directly (for chat mode)
   */
  async executeTask(
    context: AgentExecutionContext,
    callbacks?: {
      onText?: (text: string) => void;
      onToolUse?: (name: string, input: Record<string, unknown>) => void;
      onComplete?: (result: CliExecutionResult) => void;
      onError?: (error: string) => void;
    },
  ): Promise<CliExecutionResult> {
    this.leadLogger.log(`唐僧开始处理: ${context.prompt.substring(0, 50)}...`);

    return super.execute(context, {
      onText: (_: string, text: string) => callbacks?.onText?.(text),
      onToolUse: (_: string, name: string, input: Record<string, unknown>) => {
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_: string, result: CliExecutionResult) => {
        this.leadLogger.log(`处理完成: ${result.success ? '成功' : '失败'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_: string, error: string) => {
        this.leadLogger.error(`处理失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}