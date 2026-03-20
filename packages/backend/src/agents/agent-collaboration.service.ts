import { Injectable, Logger } from '@nestjs/common';
import { CliExecutionResult } from '@monkagents/shared';
import { AgentsService, AgentSelectionResult } from './agents.service';
import { AgentMentionService } from './agent-mention.service';
import { AgentExecutionContext } from './executable-agent-base';

/**
 * 协作任务状态
 */
export type CollaborationStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * 协作步骤
 */
export interface CollaborationStep {
  id: string;
  agentId: string;
  agentName: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: CliExecutionResult;
  dependsOn?: string[];  // 依赖的前置步骤
}

/**
 * 协作会话
 */
export interface CollaborationSession {
  id: string;
  sessionId: string;  // 用户会话 ID
  originalTask: string;
  status: CollaborationStatus;
  steps: CollaborationStep[];
  createdAt: Date;
  updatedAt: Date;
  currentStepIndex: number;
}

/**
 * 智能体协作服务
 * 负责：
 * 1. 多智能体任务协调
 * 2. 任务分解与分配
 * 3. 智能体间通信
 * 4. 协作流程管理
 */
@Injectable()
export class AgentCollaborationService {
  private readonly logger = new Logger(AgentCollaborationService.name);
  private collaborationSessions: Map<string, CollaborationSession> = new Map();

  constructor(
    private readonly agentsService: AgentsService,
    private readonly mentionService: AgentMentionService,
  ) {}

  /**
   * 创建协作会话
   */
  createCollaborationSession(
    sessionId: string,
    task: string,
    agentIds?: string[],
  ): CollaborationSession {
    const collaborationId = `collab-${Date.now()}`;
    const steps: CollaborationStep[] = [];

    // 如果指定了智能体，为每个智能体创建步骤
    if (agentIds && agentIds.length > 0) {
      agentIds.forEach((agentId, index) => {
        steps.push({
          id: `step-${index}`,
          agentId,
          agentName: this.mentionService.getAgentName(agentId),
          task: `协作任务 - 第 ${index + 1} 步`,
          status: 'pending',
          dependsOn: index > 0 ? [`step-${index - 1}`] : undefined,
        });
      });
    } else {
      // 自动分配智能体
      const assignment = this.assignAgentsForTask(task);
      assignment.forEach((agent, index) => {
        steps.push({
          id: `step-${index}`,
          agentId: agent.agentId,
          agentName: agent.agentName,
          task: agent.task,
          status: 'pending',
          dependsOn: index > 0 ? [`step-${index - 1}`] : undefined,
        });
      });
    }

    const session: CollaborationSession = {
      id: collaborationId,
      sessionId,
      originalTask: task,
      status: 'pending',
      steps,
      createdAt: new Date(),
      updatedAt: new Date(),
      currentStepIndex: 0,
    };

    this.collaborationSessions.set(collaborationId, session);
    this.logger.log(`Created collaboration session: ${collaborationId}`);

    return session;
  }

  /**
   * 为任务自动分配智能体
   */
  assignAgentsForTask(task: string): Array<AgentSelectionResult & { task: string }> {
    const assignments: Array<AgentSelectionResult & { task: string }> = [];

    // 分析任务，决定需要哪些智能体
    const taskLower = task.toLowerCase();

    // 检查是否需要审查（沙和尚）
    if (this.needsReview(taskLower)) {
      const result = this.agentsService.selectBestAgent('审查代码质量');
      assignments.push({ ...result, task: '代码审查和质量检查' });
    }

    // 检查是否需要实现（孙悟空）
    if (this.needsImplementation(taskLower)) {
      const result = this.agentsService.selectBestAgent('实现代码');
      assignments.push({ ...result, task: '代码实现和开发' });
    }

    // 检查是否需要文档（猪八戒）
    if (this.needsDocumentation(taskLower)) {
      const result = this.agentsService.selectBestAgent('编写文档');
      assignments.push({ ...result, task: '文档编写' });
    }

    // 检查是否需要架构咨询（如来佛祖）
    if (this.needsArchitectureAdvice(taskLower)) {
      const result = this.agentsService.selectBestAgent('架构设计咨询');
      assignments.push({ ...result, task: '架构咨询和建议' });
    }

    // 如果没有匹配任何特定任务，使用默认智能体
    if (assignments.length === 0) {
      const result = this.agentsService.selectBestAgent(task);
      assignments.push({ ...result, task: task });
    }

    return assignments;
  }

  /**
   * 执行协作任务
   */
  async executeCollaboration(
    collaborationId: string,
    context: AgentExecutionContext,
    callbacks?: {
      onStepStart?: (step: CollaborationStep) => void;
      onStepComplete?: (step: CollaborationStep, result: CliExecutionResult) => void;
      onStepError?: (step: CollaborationStep, error: string) => void;
      onComplete?: (session: CollaborationSession) => void;
    },
  ): Promise<CollaborationSession> {
    const session = this.collaborationSessions.get(collaborationId);
    if (!session) {
      throw new Error(`Collaboration session not found: ${collaborationId}`);
    }

    session.status = 'in_progress';
    session.updatedAt = new Date();

    this.logger.log(`Starting collaboration: ${collaborationId}`);

    for (let i = 0; i < session.steps.length; i++) {
      const step = session.steps[i];

      // 检查依赖
      if (step.dependsOn) {
        const depsCompleted = step.dependsOn.every(depId => {
          const depStep = session.steps.find(s => s.id === depId);
          return depStep?.status === 'completed';
        });

        if (!depsCompleted) {
          step.status = 'failed';
          this.logger.warn(`Step ${step.id} dependencies not met`);
          continue;
        }
      }

      // 更新当前步骤
      session.currentStepIndex = i;
      step.status = 'running';
      callbacks?.onStepStart?.(step);

      // 获取智能体
      const agent = this.agentsService.getExecutableAgent(step.agentId);
      if (!agent) {
        step.status = 'failed';
        callbacks?.onStepError?.(step, `Agent not found: ${step.agentId}`);
        continue;
      }

      // 执行步骤
      const stepContext: AgentExecutionContext = {
        ...context,
        prompt: this.buildStepPrompt(step, session),
      };

      try {
        const result = await agent.execute(stepContext);

        step.status = result.success ? 'completed' : 'failed';
        step.result = result;

        if (result.success) {
          callbacks?.onStepComplete?.(step, result);
        } else {
          callbacks?.onStepError?.(step, result.error || 'Step execution failed');
        }
      } catch (error) {
        step.status = 'failed';
        callbacks?.onStepError?.(step, String(error));
      }

      session.updatedAt = new Date();
    }

    // 更新最终状态
    const allCompleted = session.steps.every(s => s.status === 'completed');
    const anyFailed = session.steps.some(s => s.status === 'failed');

    session.status = allCompleted ? 'completed' : (anyFailed ? 'failed' : 'completed');
    session.updatedAt = new Date();

    callbacks?.onComplete?.(session);

    return session;
  }

  /**
   * 构建步骤提示
   */
  private buildStepPrompt(step: CollaborationStep, session: CollaborationSession): string {
    const parts: string[] = [];

    parts.push(`【协作任务 #${session.id}】`);
    parts.push(`原始任务: ${session.originalTask}`);
    parts.push(`\n你的子任务: ${step.task}`);
    parts.push(`\n步骤 ${session.steps.indexOf(step) + 1} / ${session.steps.length}`);

    // 添加前置步骤的结果摘要
    const prevSteps = session.steps.filter((_, i) =>
      session.steps.indexOf(step) > i &&
      session.steps[i].status === 'completed'
    );

    if (prevSteps.length > 0) {
      parts.push('\n前置步骤结果:');
      prevSteps.forEach(ps => {
        parts.push(`- ${ps.agentName}: ${ps.result?.success ? '完成' : '失败'}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * 获取协作会话
   */
  getCollaborationSession(collaborationId: string): CollaborationSession | undefined {
    return this.collaborationSessions.get(collaborationId);
  }

  /**
   * 获取所有协作会话
   */
  getAllCollaborationSessions(): CollaborationSession[] {
    return Array.from(this.collaborationSessions.values());
  }

  /**
   * 取消协作
   */
  cancelCollaboration(collaborationId: string): void {
    const session = this.collaborationSessions.get(collaborationId);
    if (session) {
      session.status = 'failed';
      session.updatedAt = new Date();
      this.logger.log(`Collaboration cancelled: ${collaborationId}`);
    }
  }

  // 任务分析辅助方法
  private needsReview(task: string): boolean {
    const keywords = ['审查', 'review', '检查', 'check', '质量', 'quality', '验证'];
    return keywords.some(k => task.includes(k));
  }

  private needsImplementation(task: string): boolean {
    const keywords = ['实现', 'implement', '编写', 'write', '开发', 'develop', '代码', 'code'];
    return keywords.some(k => task.includes(k));
  }

  private needsDocumentation(task: string): boolean {
    const keywords = ['文档', 'document', '说明', 'readme', '注释', 'comment'];
    return keywords.some(k => task.includes(k));
  }

  private needsArchitectureAdvice(task: string): boolean {
    const keywords = ['架构', 'architecture', '设计', 'design', '重构', 'refactor'];
    return keywords.some(k => task.includes(k));
  }

  /**
   * 生成协作报告
   */
  generateCollaborationReport(session: CollaborationSession): string {
    const lines: string[] = [];

    lines.push(`协作任务报告 - ${session.id}`);
    lines.push(`================================`);
    lines.push(`状态: ${session.status}`);
    lines.push(`原始任务: ${session.originalTask}`);
    lines.push(`\n执行步骤:`);

    session.steps.forEach((step, index) => {
      const statusIcon = step.status === 'completed' ? '✓' :
                        step.status === 'failed' ? '✗' :
                        step.status === 'running' ? '►' : '○';
      lines.push(`  ${statusIcon} 步骤 ${index + 1}: ${step.agentName} - ${step.task}`);
      if (step.result) {
        lines.push(`    结果: ${step.result.success ? '成功' : '失败'}`);
      }
    });

    lines.push(`\n创建时间: ${session.createdAt.toLocaleString()}`);
    lines.push(`更新时间: ${session.updatedAt.toLocaleString()}`);

    return lines.join('\n');
  }
}