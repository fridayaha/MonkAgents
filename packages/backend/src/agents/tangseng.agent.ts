import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult, AgentRole } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { TaskPlanner, TaskPlanResult, DecompositionResult } from './task-planner';
import { TasksService } from '../tasks/tasks.service';
import { WebSocketService } from '../websocket/websocket.service';
import { SessionService } from '../session/session.service';
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
  private sessionService: SessionService | null = null;
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
    sessionService?: SessionService,
  ): void {
    this.taskPlanner = taskPlanner;
    this.tasksService = tasksService;
    this.wsService = wsService;  // Uses inherited protected wsService
    this.agentsService = agentsService;
    this.sessionService = sessionService || null;
  }

  /**
   * Process a user message - main coordination method
   * Supports three types: task, chat, help
   */
  async processUserMessage(
    sessionId: string,
    userPrompt: string,
    workingDirectory?: string,
  ): Promise<Task | null> {
    this.logger.log(`处理用户消息: ${userPrompt.substring(0, 50)}...`);
    this.status = 'thinking';

    try {
      // Get session working directory
      let sessionWorkingDir = workingDirectory;
      if (!sessionWorkingDir && this.sessionService) {
        try {
          const session = await this.sessionService.findOne(sessionId);
          sessionWorkingDir = session.workingDirectory;
        } catch (e) {
          this.logger.warn(`无法获取会话工作目录: ${e}`);
        }
      }
      sessionWorkingDir = sessionWorkingDir || process.cwd();
      this.logger.debug(`会话工作目录: ${sessionWorkingDir}`);

      // Use intelligent planning via CLI
      const planResult = await this.createPlan(userPrompt, sessionWorkingDir);

      this.logger.debug(`规划结果: type=${planResult.type}, steps=${planResult.steps.length}, needsHelp=${planResult.needsHelp}`);

      // Handle different types
      switch (planResult.type) {
        case 'chat':
          // 闲聊模式 - 各智能体自由发挥
          return this.handleChatMode(sessionId, userPrompt, planResult);

        case 'help':
          // 求助模式 - 请求如来佛祖帮助
          return this.handleHelpMode(sessionId, userPrompt, planResult, sessionWorkingDir);

        case 'task':
        default:
          // 任务模式 - 正常任务分解执行
          return this.handleTaskMode(sessionId, userPrompt, planResult, sessionWorkingDir);
      }
    } catch (error) {
      this.status = 'idle';
      this.logger.error(`处理消息失败: ${error}`);
      throw error;
    }
  }

  /**
   * Handle chat mode - agents respond freely without task assignment
   */
  private async handleChatMode(
    sessionId: string,
    _userPrompt: string,
    planResult: TaskPlanResult,
  ): Promise<null> {
    this.logger.log('闲聊模式: 智能体自由发挥');

    // Broadcast Tangseng's analysis
    this.wsService!.broadcastMessage(sessionId, {
      id: `msg-${Date.now()}-tangseng`,
      sessionId,
      sender: 'agent',
      senderId: 'tangseng',
      senderName: '唐僧',
      type: 'text',
      content: `阿弥陀佛，贫僧看施主似乎并无具体任务...${planResult.analysis}`,
      createdAt: new Date(),
    });

    // Broadcast chat complete - let frontend know we're done
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
    return null;
  }

  /**
   * Handle help mode - request Rulai's assistance
   */
  private async handleHelpMode(
    sessionId: string,
    userPrompt: string,
    planResult: TaskPlanResult,
    workingDirectory: string,
  ): Promise<Task | null> {
    this.logger.log('求助模式: 请求如来佛祖协助');

    // Broadcast Tangseng's message
    this.wsService!.broadcastMessage(sessionId, {
      id: `msg-${Date.now()}-tangseng`,
      sessionId,
      sender: 'agent',
      senderId: 'tangseng',
      senderName: '唐僧',
      type: 'text',
      content: `阿弥陀佛...此任务颇为棘手，贫僧需请如来佛祖指点迷津。\n\n${planResult.analysis}`,
      createdAt: new Date(),
    });

    // Get Rulai agent
    const rulaiAgent = this.agentsService?.getExecutableAgent('rulai');

    if (!rulaiAgent) {
      this.wsService!.broadcastMessage(sessionId, {
        id: `error-${Date.now()}`,
        sessionId,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'error',
        content: '如来佛祖暂时不可用，请稍后再试',
        createdAt: new Date(),
      });
      this.status = 'idle';
      return null;
    }

    // Broadcast Rulai is thinking
    this.wsService!.broadcastAgentActivity(
      sessionId,
      'rulai',
      '如来佛祖',
      'thinking',
      '正在参悟玄机...',
    );

    try {
      const context: AgentExecutionContext = {
        sessionId,
        taskId: `help-${Date.now()}`,
        subtaskId: `subtask-help`,
        workingDirectory,
        sessionWorkingDirectory: workingDirectory,
        prompt: `用户遇到棘手问题，请求指点:\n\n${userPrompt}\n\n分析: ${planResult.analysis}`,
      };

      await rulaiAgent.execute(context, {
        onText: (_: string, text: string) => {
          this.wsService!.emitToSession(sessionId, 'message', {
            id: `msg-${Date.now()}`,
            sessionId,
            sender: 'agent',
            senderId: 'rulai',
            senderName: '如来佛祖',
            type: 'text',
            content: text,
            createdAt: new Date(),
          });
        },
        onToolUse: (_: string, name: string, input: Record<string, unknown>) => {
          this.wsService!.emitToSession(sessionId, 'message', {
            id: `tool-${Date.now()}`,
            sessionId,
            sender: 'agent',
            senderId: 'rulai',
            senderName: '如来佛祖',
            type: 'tool_use',
            content: `使用神通: ${name}`,
            metadata: { toolName: name, input },
            createdAt: new Date(),
          });
        },
        onComplete: () => {
          this.wsService!.broadcastAgentActivity(
            sessionId,
            'rulai',
            '如来佛祖',
            'idle',
            '点化完成',
          );
        },
        onError: (_: string, error: string) => {
          this.wsService!.emitToSession(sessionId, 'message', {
            id: `error-${Date.now()}`,
            sessionId,
            sender: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'error',
            content: `如来佛祖参悟出错: ${error}`,
            createdAt: new Date(),
          });
        },
      });
    } catch (error) {
      this.logger.error(`Rulai execution failed: ${error}`);
    }

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
    return null;
  }

  /**
   * Handle task mode - normal task decomposition and execution
   */
  private async handleTaskMode(
    sessionId: string,
    userPrompt: string,
    planResult: TaskPlanResult,
    workingDirectory: string,
  ): Promise<Task> {
    this.logger.log(`任务模式: ${planResult.steps.length} 个步骤`);

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

    // Convert PlannedStep to steps format for execution
    const steps = planResult.steps.map((step, index) => ({
      order: index,
      agentId: step.agentRole,
      agentRole: this.getAgentRoleFromId(step.agentRole),
      description: step.taskDetail,
      dependencies: step.dependencies.map(d => d - 1),
      estimatedComplexity: (step.priority === 'high' ? 'high' : step.priority === 'low' ? 'low' : 'medium') as 'high' | 'medium' | 'low',
    }));

    // Update task with assigned agents
    const agentIds = [...new Set(steps.map(s => s.agentId))];
    await this.tasksService!.update(task.id, {
      assignedAgents: agentIds,
      status: 'executing',
    });

    // Create subtasks
    for (const step of steps) {
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
      content: this.formatPlanMessageFromResult(planResult),
      createdAt: new Date(),
    });

    // Execute subtasks sequentially with working directory
    await this.executeSubtasks(sessionId, task.id, { steps, summary: planResult.summary, requiresReview: planResult.needsHelp }, workingDirectory);

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
  }

  /**
   * Get agent role from agent ID
   */
  private getAgentRoleFromId(agentId: string): AgentRole {
    const roleMap: Record<string, AgentRole> = {
      tangseng: 'master',
      wukong: 'executor',
      bajie: 'assistant',
      shaseng: 'inspector',
      rulai: 'advisor',
    };
    return roleMap[agentId] || 'executor';
  }

  /**
   * Create execution plan from user prompt using intelligent planning
   */
  async createPlan(userPrompt: string, workingDirectory?: string): Promise<TaskPlanResult> {
    this.status = 'thinking';

    if (!this.taskPlanner) {
      this.status = 'idle';
      throw new Error('Task planner not initialized');
    }

    try {
      const planResult = await this.taskPlanner.planWithTangseng(userPrompt, workingDirectory);
      this.status = 'idle';
      return planResult;
    } catch (error) {
      this.status = 'idle';
      throw error;
    }
  }

  /**
   * Execute subtasks by delegating to appropriate agents
   * Each subtask gets the session working directory for proper workspace isolation
   */
  private async executeSubtasks(
    sessionId: string,
    taskId: string,
    plan: DecompositionResult,
    sessionWorkingDir: string,
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

      this.logger.log(`🚀 启动智能体: ${agentName} | 任务: ${step.description.substring(0, 50)}...`);
      this.logger.debug(`工作目录: ${sessionWorkingDir}`);

      try {
        // Create context with proper working directory
        const context: AgentExecutionContext = {
          sessionId,
          taskId,
          subtaskId: `subtask-${step.order}`,
          workingDirectory: sessionWorkingDir,
          sessionWorkingDirectory: sessionWorkingDir,  // Pass session working directory
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
            this.logger.log(`✅ 智能体 ${agentName} 完成`);
            this.wsService!.broadcastAgentActivity(
              sessionId,
              agentId,
              agentName,
              'idle',
              '任务完成',
            );
          },
          onError: (_sessionId: string, error: string) => {
            this.logger.error(`❌ 智能体 ${agentName} 执行出错: ${error}`);
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
   * Format plan message for display (new TaskPlanResult format)
   */
  private formatPlanMessageFromResult(planResult: TaskPlanResult): string {
    const lines = ['📋 **任务分解计划**\n'];

    for (const step of planResult.steps) {
      const agentEmoji = this.getAgentEmojiById(step.agentRole);
      const deps = step.dependencies.length > 0
        ? ` (依赖: 步骤${step.dependencies.join(', ')})`
        : '';
      const priorityEmoji = step.priority === 'high' ? '🔴' : step.priority === 'low' ? '🟢' : '🟡';
      lines.push(`${step.stepId}. ${agentEmoji} **${step.taskName}**${deps}`);
      lines.push(`   ${priorityEmoji} ${step.taskDetail}`);
    }

    lines.push(`\n${planResult.analysis}`);
    if (planResult.summary) {
      lines.push(`\n${planResult.summary}`);
    }
    if (planResult.needsHelp) {
      lines.push('\n⚠️ 此任务较为复杂，可能需要如来佛祖指点。');
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