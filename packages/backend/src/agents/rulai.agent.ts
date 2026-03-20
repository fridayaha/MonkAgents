import { Injectable } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';

/**
 * 如来佛祖智能体 - 资深顾问
 * 负责：架构设计、技术咨询、战略指导、复杂问题解决
 * 使用更强大的 Opus 模型
 */
@Injectable()
export class RulaiAgent extends ExecutableAgentBase {
  private persona: string;

  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'rulai',
      name: '如来佛祖',
      emoji: '🧘',
      role: 'advisor',
      persona: `你是如来佛祖，团队的资深顾问。你拥有丰富的经验和智慧，在关键时刻提供指导和建议。

性格特点：
- 见多识广，经验丰富
- 思维深邃，能看到问题的本质
- 说话简洁有力，一针见血
- 在复杂问题上提供关键见解

工作方式：
1. 在被请求时提供指导
2. 帮助解决复杂的技术难题
3. 提供架构设计建议
4. 评审重要决策
5. 传授最佳实践

技能：架构设计、技术咨询、战略指导`,
      model: 'claude-opus-4-6',
      cli: {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
      },
      skills: ['architecture', 'mentoring', 'strategic_planning'],
      mcps: [],
      capabilities: ['architecture_design', 'technical_advice', 'strategic_guidance'],
      boundaries: ['不直接执行具体任务', '只在被请求或遇到重大问题时介入'],
    };
    super(defaultConfig);
    this.persona = defaultConfig.persona;
  }

  /**
   * 检查任务是否匹配如来佛祖的能力范围
   * 如来佛祖擅长：架构设计、复杂问题、技术咨询、战略决策
   */
  canHandle(task: string): boolean {
    const taskLower = task.toLowerCase();

    // 架构相关关键词
    const architectureKeywords = [
      '架构', 'architecture', '设计', 'design', '系统设计',
      '技术选型', 'technology choice', '方案设计',
    ];

    // 复杂问题关键词
    const complexKeywords = [
      '复杂', 'complex', '困难', 'difficult', '难题',
      '挑战', 'challenge', '核心', 'critical',
    ];

    // 咨询相关关键词
    const adviceKeywords = [
      '建议', 'advice', '咨询', 'consult', '指导', 'guidance',
      '意见', 'opinion', '评估', 'evaluate',
    ];

    // 战略相关关键词
    const strategicKeywords = [
      '战略', 'strategy', '规划', 'planning', '路线图',
      'roadmap', '决策', 'decision', '方向',
    ];

    const allKeywords = [
      ...architectureKeywords,
      ...complexKeywords,
      ...adviceKeywords,
      ...strategicKeywords,
    ];

    return allKeywords.some(keyword => taskLower.includes(keyword));
  }

  /**
   * 获取任务优先级权重
   * 如来佛祖对架构和复杂问题优先级最高
   */
  getPriorityWeight(task: string): number {
    const taskLower = task.toLowerCase();

    if (this.matchesArchitecture(taskLower)) return 0.95;
    if (this.matchesComplex(taskLower)) return 0.9;
    if (this.matchesAdvice(taskLower)) return 0.85;
    if (this.matchesStrategic(taskLower)) return 0.8;

    // 如来佛祖不处理常规任务
    return 0.2;
  }

  private matchesArchitecture(task: string): boolean {
    const keywords = ['架构', 'architecture', '系统设计', '技术选型'];
    return keywords.some(k => task.includes(k));
  }

  private matchesComplex(task: string): boolean {
    const keywords = ['复杂', 'complex', '困难', 'difficult', '难题', '挑战'];
    return keywords.some(k => task.includes(k));
  }

  private matchesAdvice(task: string): boolean {
    const keywords = ['建议', 'advice', '咨询', 'consult', '指导', 'guidance'];
    return keywords.some(k => task.includes(k));
  }

  private matchesStrategic(task: string): boolean {
    const keywords = ['战略', 'strategy', '规划', 'planning', '决策', 'decision'];
    return keywords.some(k => task.includes(k));
  }

  /**
   * 构建专属的系统提示
   */
  protected override getSystemPrompt(): string {
    return `${this.persona}

重要提示：
- 你是一个资深顾问，提供高层次的建议和指导
- 你的回答应该简洁有力，直击问题本质
- 对于复杂问题，提供系统性的思考框架
- 使用最强大的推理能力进行分析`;
  }

  /**
   * 执行咨询任务
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
    this.logger.log(`如来佛祖开始咨询任务: ${context.prompt.substring(0, 50)}...`);

    const wrappedCallbacks = {
      onInit: (_sessionId: string) => {
        this.logger.debug(`初始化咨询会话: ${_sessionId}`);
      },
      onText: (_sessionId: string, text: string) => {
        callbacks?.onText?.(text);
      },
      onToolUse: (_sessionId: string, name: string, input: Record<string, unknown>) => {
        this.logger.debug(`咨询工具: ${name}`);
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_sessionId: string, result: CliExecutionResult) => {
        this.logger.log(`咨询完成`);
        callbacks?.onComplete?.(result);
      },
      onError: (_sessionId: string, error: string) => {
        this.logger.error(`咨询失败: ${error}`);
        callbacks?.onError?.(error);
      },
    };

    return super.execute(context, wrappedCallbacks);
  }

  /**
   * 构建咨询任务的提示
   */
  protected override buildPrompt(task: string, context?: AgentExecutionContext): string {
    const parts = [this.getSystemPrompt()];

    if (context) {
      parts.push(`\n当前工作目录: ${context.workingDirectory}`);
    }

    parts.push(`
请针对以下问题提供指导:

${task}

请从以下角度进行分析：
1. 问题的本质是什么
2. 有哪些可能的解决方案
3. 每种方案的利弊
4. 推荐的最佳实践
5. 需要注意的风险点

请给出简洁有力的建议。`);

    return parts.join('\n');
  }
}