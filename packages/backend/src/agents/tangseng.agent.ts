import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';
import { TaskPlanner, DecompositionResult } from './task-planner';
import { TasksService } from '../tasks/tasks.service';
import { WebSocketService } from '../websocket/websocket.service';
import { Task } from '../database/entities/task.entity';
import { ConfigService } from '../config/config.service';

/**
 * Tangseng (Master) Agent - Team Leader
 *
 * Responsibilities:
 * - Analyze user requirements
 * - Create execution plans
 * - Coordinate team members
 * - Review and summarize results
 */
@Injectable()
export class TangsengAgent extends AgentBase implements OnModuleInit {
  private configService: ConfigService;
  private taskPlanner: TaskPlanner | null = null;
  private tasksService: TasksService | null = null;
  private wsService: WebSocketService | null = null;
  private agentsService: any = null; // Will be set via setDependencies

  constructor(configService: ConfigService) {
    super({} as AgentConfig);
    this.configService = configService;
  }

  onModuleInit() {
    const config = this.configService.getAgentConfig('tangseng');
    if (config) {
      this.config = config;
      (this.logger as any).context = `${config.name}Agent`;
    }
  }

  /**
   * Set dependencies (called by module)
   */
  setDependencies(
    taskPlanner: TaskPlanner,
    tasksService: TasksService,
    wsService: WebSocketService,
    agentsService?: any,
  ): void {
    this.taskPlanner = taskPlanner;
    this.tasksService = tasksService;
    this.wsService = wsService;
    this.agentsService = agentsService;
  }

  /**
   * Analyze user prompt and create execution plan
   */
  override async analyze(prompt: string): Promise<string> {
    this.logger.debug(`分析任务: ${prompt}`);
    this.status = 'thinking';

    if (!this.taskPlanner) {
      this.status = 'idle';
      return '任务规划器未初始化';
    }

    try {
      // Decompose the task
      const decomposition = await this.taskPlanner.decompose(prompt);

      this.status = 'idle';
      return decomposition.summary;
    } catch (error) {
      this.status = 'idle';
      this.logger.error(`分析失败: ${error}`);
      return `分析失败: ${error}`;
    }
  }

  /**
   * Execute task coordination
   */
  override async execute(task: string): Promise<AgentExecutionResult> {
    this.logger.debug(`执行任务协调: ${task}`);

    return {
      success: true,
      output: `[唐僧] 任务协调完成`,
    };
  }

  /**
   * Create execution plan from user prompt
   */
  async createPlan(userPrompt: string): Promise<DecompositionResult> {
    this.status = 'thinking';

    if (!this.taskPlanner) {
      this.status = 'idle';
      throw new Error('Task planner not initialized');
    }

    try {
      const decomposition = await this.taskPlanner.decompose(userPrompt);
      this.status = 'idle';
      return decomposition;
    } catch (error) {
      this.status = 'idle';
      throw error;
    }
  }

  /**
   * Process a user message and coordinate task execution
   */
  async processUserMessage(
    sessionId: string,
    userPrompt: string,
  ): Promise<Task> {
    this.logger.log(`处理用户消息: ${userPrompt.substring(0, 50)}...`);
    this.status = 'thinking';

    try {
      // Create task in database
      const task = await this.tasksService!.create({
        sessionId,
        userPrompt,
      });

      // Broadcast task status
      this.wsService!.emitToSession(sessionId, 'task_status', {
        taskId: task.id,
        status: 'thinking',
        message: '正在分析任务...',
      });

      // Create execution plan
      const plan = await this.createPlan(userPrompt);

      // Update task with assigned agents
      const agentIds = [...new Set(plan.steps.map(s => s.agentId))];
      await this.tasksService!.update(task.id, {
        assignedAgents: agentIds,
        status: 'executing',
      });

      // Create subtasks
      for (const step of plan.steps) {
        await this.tasksService!.createSubtask({
          taskId: task.id,
          agentId: step.agentId,
          agentRole: step.agentRole,
          description: step.description,
          order: step.order,
        });
      }

      // Broadcast plan to user
      this.wsService!.emitToSession(sessionId, 'message', {
        id: `plan-${Date.now()}`,
        sessionId,
        sender: 'agent',
        senderId: 'tangseng',
        senderName: '唐僧',
        type: 'text',
        content: this.formatPlanMessage(plan),
        createdAt: new Date(),
      });

      // Execute subtasks sequentially
      await this.executeSubtasks(sessionId, task.id, plan);

      // Update task status to completed
      await this.tasksService!.update(task.id, {
        status: 'completed',
        result: '任务执行完成',
      });

      // Broadcast completion
      this.wsService!.emitToSession(sessionId, 'task_status', {
        taskId: task.id,
        status: 'completed',
        message: '任务已完成',
      });

      // Broadcast chat complete to clear loading
      this.wsService!.broadcastMessage(sessionId, {
        id: `chat-complete-${Date.now()}`,
        sessionId,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'chat_complete',
        content: '',
        createdAt: new Date(),
      });

      this.status = 'idle';
      return task;
    } catch (error) {
      this.status = 'idle';
      this.logger.error(`处理消息失败: ${error}`);
      throw error;
    }
  }

  /**
   * Execute subtasks by delegating to appropriate agents
   */
  private async executeSubtasks(
    sessionId: string,
    taskId: string,
    plan: DecompositionResult,
  ): Promise<void> {
    if (!this.agentsService) {
      this.logger.warn('AgentsService not available, skipping actual execution');
      return;
    }

    for (const step of plan.steps) {
      const agentId = step.agentId;
      const agentName = this.getAgentNameById(agentId);

      // Skip if this is tangseng (master) - we don't execute CLI
      if (agentId === 'tangseng') {
        this.logger.debug(`跳过唐僧自己的子任务: ${step.description}`);
        continue;
      }

      // Get the executable agent
      const agent = this.agentsService.getExecutableAgent(agentId);

      if (!agent) {
        this.logger.warn(`Agent ${agentId} not found, skipping`);
        this.wsService!.emitToSession(sessionId, 'message', {
          id: `error-${Date.now()}`,
          sessionId,
          sender: 'system',
          senderId: 'system',
          senderName: '系统',
          type: 'error',
          content: `智能体 ${agentName} 不可用`,
          createdAt: new Date(),
        });
        continue;
      }

      // Broadcast agent is thinking
      this.wsService!.broadcastAgentActivity(
        sessionId,
        agentId,
        agentName,
        'thinking',
        `正在执行: ${step.description}`,
      );

      try {
        // Execute through the agent
        const context = {
          sessionId,
          taskId,
          subtaskId: `subtask-${step.order}`,
          workingDirectory: process.cwd(),
          prompt: step.description,
        };

        const result = await agent.execute(context, {
          onText: (_sessionId: string, text: string) => {
            this.wsService!.emitToSession(sessionId, 'message', {
              id: `msg-${Date.now()}`,
              sessionId,
              sender: 'agent',
              senderId: agentId,
              senderName: agentName,
              type: 'text',
              content: text,
              createdAt: new Date(),
            });
          },
          onToolUse: (_sessionId: string, name: string, input: Record<string, unknown>) => {
            this.wsService!.emitToSession(sessionId, 'message', {
              id: `tool-${Date.now()}`,
              sessionId,
              sender: 'agent',
              senderId: agentId,
              senderName: agentName,
              type: 'tool_use',
              content: `使用工具: ${name}`,
              metadata: { toolName: name, input },
              createdAt: new Date(),
            });
          },
          onComplete: () => {
            this.wsService!.broadcastAgentActivity(
              sessionId,
              agentId,
              agentName,
              'idle',
              '任务完成',
            );
          },
          onError: (_sessionId: string, error: string) => {
            this.wsService!.emitToSession(sessionId, 'message', {
              id: `error-${Date.now()}`,
              sessionId,
              sender: 'system',
              senderId: 'system',
              senderName: '系统',
              type: 'error',
              content: `${agentName} 执行出错: ${error}`,
              createdAt: new Date(),
            });
          },
        });

        this.logger.debug(`Agent ${agentId} completed: ${result.success}`);

      } catch (error) {
        this.logger.error(`Agent ${agentId} execution failed: ${error}`);
        this.wsService!.emitToSession(sessionId, 'message', {
          id: `error-${Date.now()}`,
          sessionId,
          sender: 'system',
          senderId: 'system',
          senderName: '系统',
          type: 'error',
          content: `${agentName} 执行失败: ${error}`,
          createdAt: new Date(),
        });
      }
    }
  }

  /**
   * Get agent name by ID
   */
  private getAgentNameById(agentId: string): string {
    const names: Record<string, string> = {
      tangseng: '唐僧',
      wukong: '孙悟空',
      bajie: '猪八戒',
      shaseng: '沙和尚',
      rulai: '如来佛祖',
    };
    return names[agentId] || agentId;
  }

  /**
   * Format plan message for display
   */
  private formatPlanMessage(plan: DecompositionResult): string {
    const lines = ['📋 **任务分解计划**\n'];

    for (const step of plan.steps) {
      const agentEmoji = this.getAgentEmoji(step.agentRole);
      const deps = step.dependencies.length > 0
        ? ` (依赖: ${step.dependencies.join(', ')})`
        : '';
      lines.push(`${step.order + 1}. ${agentEmoji} ${step.description}${deps}`);
    }

    lines.push(`\n${plan.summary}`);
    if (plan.requiresReview) {
      lines.push('\n⚠️ 此任务较为复杂，建议人工审核关键步骤。');
    }

    return lines.join('\n');
  }

  /**
   * Get emoji for agent role
   */
  private getAgentEmoji(role: string): string {
    const emojis: Record<string, string> = {
      master: '🧘',
      executor: '🐵',
      inspector: '🧔',
      assistant: '🐷',
      advisor: '🙏',
    };
    return emojis[role] || '🤖';
  }

  /**
   * Summarize task execution results
   */
  async summarizeResults(taskId: string): Promise<string> {
    this.status = 'thinking';

    try {
      const task = await this.tasksService!.findOne(taskId);
      const subtasks = await this.tasksService!.getSubtasks(taskId);

      const completedCount = subtasks.filter(s => s.status === 'completed').length;
      const failedCount = subtasks.filter(s => s.status === 'failed').length;

      const lines = [
        '📊 **任务执行总结**\n',
        `任务: ${task.userPrompt}`,
        `状态: ${task.status}`,
        `完成: ${completedCount}/${subtasks.length} 步骤`,
      ];

      if (failedCount > 0) {
        lines.push(`失败: ${failedCount} 步骤`);
      }

      if (task.result) {
        lines.push(`\n**结果**: ${task.result}`);
      }

      if (task.error) {
        lines.push(`\n**错误**: ${task.error}`);
      }

      this.status = 'idle';
      return lines.join('\n');
    } catch (error) {
      this.status = 'idle';
      this.logger.error(`总结失败: ${error}`);
      return `生成总结失败: ${error}`;
    }
  }

  /**
   * Check if agent can handle the task
   */
  canHandle(prompt: string): boolean {
    // Tangseng handles all coordination tasks
    // Check for keywords that indicate planning needs
    const planningKeywords = ['帮我', '请', '帮我', '需要', '想要', '分析', '计划', 'help', 'plan', 'analyze'];
    return planningKeywords.some(k => prompt.toLowerCase().includes(k)) || true;
  }
}