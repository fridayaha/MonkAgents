import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { TaskPlanner, DecompositionResult } from './task-planner';
import { TasksService } from '../tasks/tasks.service';
import { WebSocketService } from '../websocket/websocket.service';
import { Task } from '../database/entities/task.entity';

/**
 * 唐僧智能体 - 团队领导者
 * 负责：任务规划、团队协调、结果审核
 * 所有行为由配置文件驱动，但保留协调逻辑
 */
@Injectable()
export class TangsengAgent extends ExecutableAgentBase implements OnModuleInit {
  private taskPlanner: TaskPlanner | null = null;
  private tasksService: TasksService | null = null;
  // wsService is inherited from ExecutableAgentBase (protected)
  private agentsService: any = null;

  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
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
    this.wsService = wsService;  // Uses inherited protected wsService
    this.agentsService = agentsService;
  }

  /**
   * Process a user message - main coordination method
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

      // Broadcast chat complete
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

      // Skip tangseng - coordinator doesn't execute CLI
      if (agentId === 'tangseng') {
        this.logger.debug(`跳过唐僧自己的子任务: ${step.description}`);
        continue;
      }

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
        const context: AgentExecutionContext = {
          sessionId,
          taskId,
          subtaskId: `subtask-${step.order}`,
          workingDirectory: process.cwd(),
          prompt: step.description,
        };

        await agent.execute(context, {
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

        this.logger.debug(`Agent ${agentId} completed`);

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
   * Execute task via CLI for direct interaction
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
    this.logger.log(`唐僧开始处理: ${context.prompt.substring(0, 50)}...`);

    return super.execute(context, {
      onInit: (sessionId) => this.logger.debug(`初始化会话: ${sessionId}`),
      onText: (_, text) => callbacks?.onText?.(text),
      onToolUse: (_, name, input) => {
        this.logger.debug(`使用工具: ${name}`);
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_, result) => {
        this.logger.log(`处理完成: ${result.success ? '成功' : '失败'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_, error) => {
        this.logger.error(`处理失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}