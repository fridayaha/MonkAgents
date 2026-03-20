import { Injectable, Logger } from '@nestjs/common';
import { AgentRole } from '@monkagents/shared';

/**
 * Task decomposition step
 */
export interface DecompositionStep {
  order: number;
  description: string;
  agentRole: AgentRole;
  agentId: string;
  dependencies: number[]; // Indices of steps this depends on
  estimatedComplexity: 'low' | 'medium' | 'high';
}

/**
 * Task decomposition result
 */
export interface DecompositionResult {
  steps: DecompositionStep[];
  summary: string;
  requiresReview: boolean;
}

/**
 * Keywords for task type detection
 */
const TASK_KEYWORDS = {
  executor: ['写', '实现', '编码', '代码', 'bug', '修复', '函数', '组件', 'api', '重构', 'code', 'implement', 'fix', 'create'],
  inspector: ['检查', '测试', '审查', '验证', '质量', 'review', 'test', 'check', 'verify'],
  assistant: ['文档', '注释', '格式', '简单', 'document', 'format', 'comment'],
  advisor: ['架构', '设计', '建议', '复杂', '疑难', 'architecture', 'design', 'complex'],
};

/**
 * Service for decomposing tasks into subtasks
 */
@Injectable()
export class TaskPlanner {
  private readonly logger = new Logger(TaskPlanner.name);

  /**
   * Decompose a user prompt into execution steps
   */
  async decompose(userPrompt: string): Promise<DecompositionResult> {
    this.logger.debug(`Decomposing task: ${userPrompt.substring(0, 100)}...`);

    // Analyze the task
    const taskType = this.analyzeTaskType(userPrompt);
    const complexity = this.estimateComplexity(userPrompt);

    // Generate decomposition based on task type
    const steps = this.generateSteps(userPrompt, taskType, complexity);

    const result: DecompositionResult = {
      steps,
      summary: this.generateSummary(steps),
      requiresReview: complexity === 'high' || taskType === 'mixed',
    };

    this.logger.debug(`Decomposed into ${steps.length} steps`);
    return result;
  }

  /**
   * Analyze the type of task
   */
  private analyzeTaskType(prompt: string): 'coding' | 'review' | 'document' | 'mixed' | 'other' {
    const lowerPrompt = prompt.toLowerCase();

    const executorMatches = TASK_KEYWORDS.executor.filter(k => lowerPrompt.includes(k)).length;
    const inspectorMatches = TASK_KEYWORDS.inspector.filter(k => lowerPrompt.includes(k)).length;
    const assistantMatches = TASK_KEYWORDS.assistant.filter(k => lowerPrompt.includes(k)).length;
    const advisorMatches = TASK_KEYWORDS.advisor.filter(k => lowerPrompt.includes(k)).length;

    const maxMatches = Math.max(executorMatches, inspectorMatches, assistantMatches, advisorMatches);

    if (maxMatches === 0) {
      return 'other';
    }

    // Check for mixed task
    const matchCounts = [executorMatches, inspectorMatches, assistantMatches, advisorMatches];
    const significantMatches = matchCounts.filter(c => c > 0).length;

    if (significantMatches > 1) {
      return 'mixed';
    }

    if (executorMatches === maxMatches) return 'coding';
    if (inspectorMatches === maxMatches) return 'review';
    if (assistantMatches === maxMatches) return 'document';
    return 'other';
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(prompt: string): 'low' | 'medium' | 'high' {
    const lowerPrompt = prompt.toLowerCase();

    // High complexity indicators
    const highComplexityKeywords = ['架构', '系统', '多个', '复杂', '集成', '迁移', 'architecture', 'system', 'complex', 'multiple'];
    if (highComplexityKeywords.some(k => lowerPrompt.includes(k))) {
      return 'high';
    }

    // Low complexity indicators
    const lowComplexityKeywords = ['简单', '小', '单个', '快速', 'simple', 'small', 'quick', 'minor'];
    if (lowComplexityKeywords.some(k => lowerPrompt.includes(k))) {
      return 'low';
    }

    // Medium complexity by default for coding tasks
    if (prompt.length > 200 || lowerPrompt.includes('重构') || lowerPrompt.includes('refactor')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate execution steps based on task type and complexity
   */
  private generateSteps(
    _prompt: string,
    taskType: string,
    complexity: 'low' | 'medium' | 'high',
  ): DecompositionStep[] {
    const steps: DecompositionStep[] = [];
    let order = 0;

    // Step 1: Analysis (always by Master/Tangseng)
    steps.push({
      order: order++,
      description: '分析任务需求，确定执行方案',
      agentRole: 'master',
      agentId: 'tangseng',
      dependencies: [],
      estimatedComplexity: 'low',
    });

    switch (taskType) {
      case 'coding':
        // Coding workflow
        steps.push({
          order: order++,
          description: '执行代码编写/修改任务',
          agentRole: 'executor',
          agentId: 'wukong',
          dependencies: [0],
          estimatedComplexity: complexity,
        });

        // Add testing step for medium/high complexity
        if (complexity !== 'low') {
          steps.push({
            order: order++,
            description: '编写或执行测试用例',
            agentRole: 'inspector',
            agentId: 'shaseng',
            dependencies: [1],
            estimatedComplexity: 'low',
          });
        }

        // Add review step
        steps.push({
          order: order++,
          description: '代码审查和质量检查',
          agentRole: 'inspector',
          agentId: 'bajie',
          dependencies: [complexity !== 'low' ? 2 : 1],
          estimatedComplexity: 'low',
        });
        break;

      case 'review':
        steps.push({
          order: order++,
          description: '执行代码审查',
          agentRole: 'inspector',
          agentId: 'bajie',
          dependencies: [0],
          estimatedComplexity: 'medium',
        });
        break;

      case 'document':
        steps.push({
          order: order++,
          description: '编写文档或注释',
          agentRole: 'assistant',
          agentId: 'bajie',
          dependencies: [0],
          estimatedComplexity: 'low',
        });
        break;

      case 'mixed':
        // For mixed tasks, break down further
        steps.push({
          order: order++,
          description: '执行主要开发任务',
          agentRole: 'executor',
          agentId: 'wukong',
          dependencies: [0],
          estimatedComplexity: 'medium',
        });

        steps.push({
          order: order++,
          description: '编写相关文档',
          agentRole: 'assistant',
          agentId: 'bajie',
          dependencies: [1],
          estimatedComplexity: 'low',
        });

        steps.push({
          order: order++,
          description: '全面质量检查和测试',
          agentRole: 'inspector',
          agentId: 'shaseng',
          dependencies: [1, 2],
          estimatedComplexity: 'medium',
        });

        steps.push({
          order: order++,
          description: '最终审查',
          agentRole: 'inspector',
          agentId: 'bajie',
          dependencies: [3],
          estimatedComplexity: 'low',
        });
        break;

      default:
        // For unknown tasks, ask advisor
        steps.push({
          order: order++,
          description: '分析复杂任务，提供执行建议',
          agentRole: 'advisor',
          agentId: 'rulai',
          dependencies: [0],
          estimatedComplexity: 'medium',
        });
    }

    // Final step: Summary by Master
    steps.push({
      order: order++,
      description: '汇总执行结果，生成总结报告',
      agentRole: 'master',
      agentId: 'tangseng',
      dependencies: [order - 2],
      estimatedComplexity: 'low',
    });

    return steps;
  }

  /**
   * Generate summary of decomposition
   */
  private generateSummary(steps: DecompositionStep[]): string {
    const agentCount = new Set(steps.map(s => s.agentId)).size;
    const roles = [...new Set(steps.map(s => this.getRoleName(s.agentRole)))];

    return `任务已分解为 ${steps.length} 个步骤，涉及 ${agentCount} 个智能体（${roles.join('、')}）`;
  }

  /**
   * Get Chinese role name
   */
  private getRoleName(role: AgentRole): string {
    const names: Record<AgentRole, string> = {
      master: '唐僧',
      executor: '孙悟空',
      inspector: '沙和尚',
      assistant: '猪八戒',
      advisor: '如来佛祖',
    };
    return names[role] || role;
  }

  /**
   * Get agent ID by role
   */
  getAgentByRole(role: AgentRole): string {
    const mapping: Record<AgentRole, string> = {
      master: 'tangseng',
      executor: 'wukong',
      inspector: 'shaseng',
      assistant: 'bajie',
      advisor: 'rulai',
    };
    return mapping[role] || 'wukong';
  }

  /**
   * Determine if task needs human review
   */
  needsHumanReview(prompt: string, complexity: 'low' | 'medium' | 'high'): boolean {
    const lowerPrompt = prompt.toLowerCase();

    // Always need review for high complexity
    if (complexity === 'high') return true;

    // Need review for security-related tasks
    const securityKeywords = ['安全', '权限', '密码', '认证', 'security', 'auth', 'password', 'permission'];
    if (securityKeywords.some(k => lowerPrompt.includes(k))) return true;

    // Need review for data-related tasks
    const dataKeywords = ['数据库', '删除', '迁移', 'database', 'delete', 'migration'];
    if (dataKeywords.some(k => lowerPrompt.includes(k))) return true;

    return false;
  }
}