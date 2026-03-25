import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentExecutionContext } from './executable-agent-base';
import {
  AgentConfig,
  CliExecutionResult,
  AgentRole,
  ExecutionSummary,
  TaskContext,
  HandoffRequest,
} from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { TaskPlanner, TaskPlanResult, DecompositionResult } from './task-planner';
import { TasksService } from '../tasks/tasks.service';
import { WebSocketService } from '../websocket/websocket.service';
import { SessionService } from '../session/session.service';
import { Task } from '../database/entities/task.entity';
import { Subtask } from '../database/entities/subtask.entity';
import { BaseAgentService } from './base-agent.service';
import { SummaryParser } from './helpers/summary-parser';

/** 最大执行轮次（防止无限循环） */
const MAX_EXECUTION_ROUNDS = 10;

/** 每个智能体最大 handoff 次数 */
const MAX_HANDOFF_PER_AGENT = 15;

/** 智能体名称映射 */
const AGENT_NAMES: Record<string, string> = {
  tangseng: '唐僧',
  wukong: '孙悟空',
  bajie: '猪八戒',
  shaseng: '沙和尚',
  rulai: '如来佛祖',
};

/**
 * 唐僧智能体 - 团队领导者
 * 负责：任务规划、团队协调、结果审核
 * 所有行为由配置文件驱动，但保留协调逻辑
 */
@Injectable()
export class TangsengAgent extends BaseAgentService implements OnModuleInit {
  private taskPlanner: TaskPlanner | null = null;
  private tasksService: TasksService | null = null;
  private sessionService: SessionService | null = null;
  // wsService is inherited from ExecutableAgentBase (protected)
  private agentsService: any = null;

  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    const config = this.configService.getAgentConfig('tangseng');
    if (config) {
      this.initialize(config);
    }
    await super.onModuleInit(); // Call parent implementation after config is loaded
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

      // Use intelligent planning via CLI
      const planResult = await this.createPlan(userPrompt, sessionWorkingDir);

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
        // Note: All callbacks removed - agent handles broadcasting internally
        onComplete: () => {
          this.wsService!.broadcastAgentActivity(
            sessionId,
            'rulai',
            '如来佛祖',
            'idle',
            '点化完成',
          );
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
    this.wsService!.broadcastMessage(sessionId, {
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
   * 支持 handoff 机制：智能体可以将任务交接给其他智能体
   */
  private async executeSubtasks(
    sessionId: string,
    taskId: string,
    _plan: DecompositionResult,
    sessionWorkingDir: string,
  ): Promise<void> {
    if (!this.agentsService) {
      this.logger.warn('AgentsService not available, skipping actual execution');
      return;
    }

    // 追踪执行状态
    let currentRound = 0;
    const handoffCounts: Map<string, number> = new Map();  // agentId -> handoff count
    const executedSubtaskIds: Set<string> = new Set();  // 已执行的子任务（用于上下文传递）
    let pendingHandoff: HandoffRequest | null = null;

    // 执行循环
    while (currentRound < MAX_EXECUTION_ROUNDS) {
      currentRound++;
      this.logger.log(`📍 执行轮次: ${currentRound}/${MAX_EXECUTION_ROUNDS}`);

      // 重新从数据库获取子任务列表，确保有最新的状态和 executionSummary
      let subtasks = await this.tasksService!.getSubtasks(taskId);

      // 确定下一个要执行的子任务
      let nextSubtask: Subtask | null = null;

      if (pendingHandoff) {
        // 有 handoff 请求，创建新的子任务并保存到数据库
        nextSubtask = await this.createHandoffSubtask(
          taskId,
          pendingHandoff,
          subtasks.length,
        );
        // 重新获取子任务列表，包含新创建的子任务
        subtasks = await this.tasksService!.getSubtasks(taskId);
        this.logger.log(`📝 创建 handoff 子任务: ${nextSubtask.id} -> ${pendingHandoff.targetAgentName}`);
      } else {
        // 按顺序找下一个未执行的子任务
        nextSubtask = subtasks.find(s =>
          !executedSubtaskIds.has(s.id) && s.agentId !== 'tangseng'
        ) || null;
      }

      if (!nextSubtask) {
        // 所有子任务完成
        this.logger.log('✅ 所有子任务已完成');
        break;
      }

      const agentId = nextSubtask.agentId;
      const agentName = AGENT_NAMES[agentId] || agentId;

      // 检查 handoff 次数
      const currentHandoffCount = handoffCounts.get(agentId) || 0;
      if (currentHandoffCount >= MAX_HANDOFF_PER_AGENT) {
        this.logger.warn(`⚠️ 智能体 ${agentName} handoff 次数已达上限 (${currentHandoffCount})`);
        // 标记为已执行，继续下一个
        executedSubtaskIds.add(nextSubtask.id);
        pendingHandoff = null;
        continue;
      }

      // 获取智能体
      const agent = this.agentsService.getExecutableAgent(agentId);
      if (!agent) {
        this.logger.warn(`Agent ${agentId} not found, skipping`);
        executedSubtaskIds.add(nextSubtask.id);
        pendingHandoff = null;
        continue;
      }

      // 构建执行上下文（包含上下文传递）
      // 传递已执行子任务的摘要，而不是已完成的
      const executedSubtasks = subtasks.filter(s => executedSubtaskIds.has(s.id));
      const context = await this.buildAgentContext(
        sessionId,
        taskId,
        nextSubtask,
        executedSubtasks,
        pendingHandoff,
        sessionWorkingDir,
      );

      // 广播智能体开始工作
      this.wsService!.broadcastAgentActivity(
        sessionId,
        agentId,
        agentName,
        'thinking',
        `正在执行: ${nextSubtask.description.substring(0, 50)}...`,
      );

      this.logger.log(`🚀 启动智能体: ${agentName} | 任务: ${nextSubtask.description.substring(0, 50)}...`);

      try {
        // 执行智能体
        const result = await agent.execute(context);

        // 更新子任务状态
        await this.tasksService!.updateSubtask(nextSubtask.id, {
          status: result.success ? 'completed' : 'failed',
          executionSummary: result.executionSummary,
          handoffCount: currentHandoffCount,
        });

        // 标记为已执行（用于后续上下文传递）
        executedSubtaskIds.add(nextSubtask.id);

        // 检查执行摘要中的 handoff 建议
        const suggestion = SummaryParser.getFirstHandoffSuggestion(result.executionSummary);

        if (suggestion && result.success) {
          // 有 handoff 建议
          this.logger.log(`🔄 智能体 ${agentName} 请求 handoff 到 ${suggestion.targetAgent}`);

          pendingHandoff = {
            targetAgentId: suggestion.targetAgent,
            targetAgentName: AGENT_NAMES[suggestion.targetAgent],
            task: suggestion.task,
            reason: suggestion.reason,
            handoffCount: (handoffCounts.get(suggestion.targetAgent) || 0) + 1,
            sourceAgentId: agentId,
            sourceAgentName: agentName,
            executionSummary: result.executionSummary,
          };

          // 更新 handoff 计数
          handoffCounts.set(suggestion.targetAgent, (handoffCounts.get(suggestion.targetAgent) || 0) + 1);

          // 广播 handoff 消息
          this.wsService!.broadcastMessage(sessionId, {
            id: `handoff-${Date.now()}`,
            sessionId,
            sender: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'text',
            content: `🔄 任务交接: ${agentName} → ${AGENT_NAMES[suggestion.targetAgent]}\n原因: ${suggestion.reason}`,
            createdAt: new Date(),
          });
        } else {
          // 无 handoff，继续下一个任务
          pendingHandoff = null;

          this.logger.log(`✅ 智能体 ${agentName} 完成`);
          this.wsService!.broadcastAgentActivity(
            sessionId,
            agentId,
            agentName,
            'idle',
            '任务完成',
          );
        }
      } catch (error) {
        this.logger.error(`Agent ${agentId} execution failed: ${error}`);

        // 更新子任务状态为失败
        await this.tasksService!.updateSubtask(nextSubtask.id, {
          status: 'failed',
        });

        executedSubtaskIds.add(nextSubtask.id);
        pendingHandoff = null;

        this.wsService!.broadcastMessage(sessionId, {
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

    // 检查是否达到最大轮次
    if (currentRound >= MAX_EXECUTION_ROUNDS) {
      this.logger.warn(`⚠️ 达到最大执行轮次 ${MAX_EXECUTION_ROUNDS}，强制结束`);

      this.wsService!.broadcastMessage(sessionId, {
        id: `warning-${Date.now()}`,
        sessionId,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'text',
        content: `⚠️ 任务执行达到最大轮次限制 (${MAX_EXECUTION_ROUNDS})，已强制结束。如有未完成的任务，请重新发起。`,
        createdAt: new Date(),
      });
    }
  }

  /**
   * 为 handoff 创建真正的子任务并保存到数据库
   */
  private async createHandoffSubtask(
    taskId: string,
    handoff: HandoffRequest,
    order: number,
  ): Promise<Subtask> {
    const subtask = await this.tasksService!.createSubtask({
      taskId,
      agentId: handoff.targetAgentId,
      agentRole: this.getAgentRoleFromId(handoff.targetAgentId),
      description: handoff.task,
      order,
    });

    return subtask;
  }

  /**
   * 构建智能体执行上下文（包含上下文传递）
   */
  private async buildAgentContext(
    sessionId: string,
    taskId: string,
    subtask: Subtask,
    completedSubtasks: Subtask[],
    handoff: HandoffRequest | null,
    workingDirectory: string,
  ): Promise<AgentExecutionContext> {
    // 收集已完成子任务的摘要（从数据库重新获取以确保有最新的 executionSummary）
    const freshSubtasks = await this.tasksService!.getSubtasks(taskId);
    const completedIds = completedSubtasks.map(s => s.id);
    const previousSummaries: ExecutionSummary[] = freshSubtasks
      .filter(s => completedIds.includes(s.id) && s.executionSummary)
      .map(s => s.executionSummary!);

    // 如果是 handoff，将源智能体的摘要也加入（如果还没有的话）
    if (handoff?.executionSummary) {
      // 检查是否已经包含（避免重复）
      const hasSourceSummary = previousSummaries.some(
        s => s === handoff.executionSummary
      );
      if (!hasSourceSummary) {
        previousSummaries.push(handoff.executionSummary);
      }
    }

    this.logger.log(`📊 上下文: ${previousSummaries.length} 个前置任务摘要`);

    // 构建任务上下文
    const task = await this.tasksService!.findOne(taskId);
    const taskContext: TaskContext = {
      originalPrompt: task?.userPrompt || '',
      planSummary: `共 ${completedSubtasks.length} 个前置任务已完成`,
      currentRound: 0,  // 会在外层循环中更新
      maxRounds: MAX_EXECUTION_ROUNDS,
    };

    // 构建基础上下文
    const context: AgentExecutionContext = {
      sessionId,
      taskId,
      subtaskId: subtask.id,
      workingDirectory,
      sessionWorkingDirectory: workingDirectory,
      prompt: subtask.description,
      taskContext,
      previousSummaries,
    };

    // 添加 handoff 信息
    if (handoff) {
      context.handoffFrom = {
        agentId: handoff.sourceAgentId!,
        agentName: handoff.sourceAgentName!,
        reason: handoff.reason,
      };
      context.handoffRequest = handoff;
    }

    return context;
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
      onText: (_: string, text: string) => callbacks?.onText?.(text),
      onToolUse: (_: string, name: string, input: Record<string, unknown>) => {
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_: string, result: CliExecutionResult) => {
        this.logger.log(`处理完成: ${result.success ? '成功' : '失败'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_: string, error: string) => {
        this.logger.error(`处理失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}