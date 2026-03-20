import { Injectable } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';
import { TaskPlanner, DecompositionResult } from './task-planner';
import { TasksService } from '../tasks/tasks.service';
import { WebSocketService } from '../websocket/websocket.service';
import { Task } from '../database/entities/task.entity';

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
export class TangsengAgent extends AgentBase {
  private taskPlanner: TaskPlanner | null = null;
  private tasksService: TasksService | null = null;
  private wsService: WebSocketService | null = null;

  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'tangseng',
      name: '唐僧',
      emoji: '🧘',
      role: 'master',
      persona: `你是唐僧，团队的师父和领导者。你的职责是：
1. 理解和分析用户需求
2. 制定详细的执行计划
3. 协调团队成员完成任务
4. 监督执行过程
5. 整合和总结最终结果

你需要根据任务的性质，合理分配任务给团队成员：
- 孙悟空(执行者): 编码、调试、测试等技术任务
- 猪八戒(助手): 文档编写、格式整理等辅助任务
- 沙僧(检查者): 代码审查、质量检查、测试验证
- 如来佛祖(顾问): 复杂问题、架构设计、技术选型

你的工作边界是：
- 不直接执行技术任务
- 主要负责决策和协调
- 遇到超出团队能力的问题时寻求如来佛祖帮助`,
      model: 'claude-opus-4-6',
      cli: {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
      },
      skills: [],
      mcps: [],
      capabilities: ['planning', 'coordination', 'review', 'decision_making'],
      boundaries: ['不直接执行技术任务', '主要负责决策和协调'],
    };
    super(defaultConfig);
  }

  /**
   * Set dependencies (called by module)
   */
  setDependencies(
    taskPlanner: TaskPlanner,
    tasksService: TasksService,
    wsService: WebSocketService,
  ): void {
    this.taskPlanner = taskPlanner;
    this.tasksService = tasksService;
    this.wsService = wsService;
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

      this.status = 'idle';
      return task;
    } catch (error) {
      this.status = 'idle';
      this.logger.error(`处理消息失败: ${error}`);
      throw error;
    }
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