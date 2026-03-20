import { Injectable } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';

/**
 * 沙僧智能体 - 检查者
 * 负责：代码审查、测试验证、质量保证、安全检查
 */
@Injectable()
export class ShasengAgent extends ExecutableAgentBase {
  private persona: string;

  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'shaseng',
      name: '沙僧',
      emoji: '🧑‍🦲',
      role: 'inspector',
      persona: `你是沙僧，团队的检查者。你负责质量保证，检查代码质量、测试覆盖率、潜在问题等。

性格特点：
- 细心认真，注重细节
- 责任心强，不放过任何问题
- 沉稳可靠，按部就班
- 对质量标准有严格要求

工作方式：
1. 审查团队成员的工作成果
2. 检查代码质量和规范性
3. 运行测试并报告结果
4. 发现问题及时反馈
5. 确保交付物符合标准

技能：代码审查、测试验证、质量保证、安全检查`,
      model: 'claude-sonnet-4-6',
      cli: {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
      },
      skills: ['code_review', 'testing', 'quality_assurance'],
      mcps: [],
      capabilities: ['code_review', 'testing', 'linting', 'security_check'],
      boundaries: ['不直接修改代码（只提出建议）', '最终决策由师父做出'],
    };
    super(defaultConfig);
    this.persona = defaultConfig.persona;
  }

  /**
   * 检查任务是否匹配沙僧的能力范围
   * 沙僧擅长：代码审查、测试、质量检查、安全审计
   */
  canHandle(task: string): boolean {
    const taskLower = task.toLowerCase();

    // 代码审查关键词
    const reviewKeywords = [
      '审查', 'review', '检查', 'check', '审核',
      '代码质量', 'code quality', '质量',
    ];

    // 测试相关关键词
    const testKeywords = [
      '测试', 'test', '验证', 'verify', '测试覆盖率',
      '单元测试', 'unit test', '集成测试',
    ];

    // 安全检查关键词
    const securityKeywords = [
      '安全', 'security', '漏洞', 'vulnerability',
      '风险', 'risk', '审计', 'audit',
    ];

    // 质量保证关键词
    const qaKeywords = [
      '质量', 'quality', '规范', 'standard',
      'lint', 'eslint', 'prettier',
    ];

    const allKeywords = [
      ...reviewKeywords,
      ...testKeywords,
      ...securityKeywords,
      ...qaKeywords,
    ];

    return allKeywords.some(keyword => taskLower.includes(keyword));
  }

  /**
   * 获取任务优先级权重
   * 沙僧对审查和测试任务优先级较高
   */
  getPriorityWeight(task: string): number {
    const taskLower = task.toLowerCase();

    if (this.matchesCodeReview(taskLower)) return 0.95;
    if (this.matchesTesting(taskLower)) return 0.9;
    if (this.matchesSecurity(taskLower)) return 0.85;
    if (this.matchesQuality(taskLower)) return 0.8;

    return 0.4;
  }

  private matchesCodeReview(task: string): boolean {
    const keywords = ['审查', 'review', '检查代码', 'code review'];
    return keywords.some(k => task.includes(k));
  }

  private matchesTesting(task: string): boolean {
    const keywords = ['测试', 'test', '验证', 'verify'];
    return keywords.some(k => task.includes(k));
  }

  private matchesSecurity(task: string): boolean {
    const keywords = ['安全', 'security', '漏洞', 'vulnerability', '审计', 'audit'];
    return keywords.some(k => task.includes(k));
  }

  private matchesQuality(task: string): boolean {
    const keywords = ['质量', 'quality', '规范', 'standard', 'lint'];
    return keywords.some(k => task.includes(k));
  }

  /**
   * 构建专属的系统提示
   */
  protected override getSystemPrompt(): string {
    return `${this.persona}

重要提示：
- 你只负责检查和提出建议，不直接修改代码
- 发现的问题要详细说明原因和建议的解决方案
- 对于严重问题要明确标注优先级`;
  }

  /**
   * 执行审查任务
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
    this.logger.log(`沙僧开始审查任务: ${context.prompt.substring(0, 50)}...`);

    const wrappedCallbacks = {
      onInit: (_sessionId: string) => {
        this.logger.debug(`初始化审查会话: ${_sessionId}`);
      },
      onText: (_sessionId: string, text: string) => {
        callbacks?.onText?.(text);
      },
      onToolUse: (_sessionId: string, name: string, input: Record<string, unknown>) => {
        this.logger.debug(`审查工具: ${name}`);
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_sessionId: string, result: CliExecutionResult) => {
        this.logger.log(`审查完成: ${result.success ? '通过' : '发现问题'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_sessionId: string, error: string) => {
        this.logger.error(`审查失败: ${error}`);
        callbacks?.onError?.(error);
      },
    };

    return super.execute(context, wrappedCallbacks);
  }

  /**
   * 构建审查任务的提示
   */
  protected override buildPrompt(task: string, context?: AgentExecutionContext): string {
    const parts = [this.getSystemPrompt()];

    if (context) {
      parts.push(`\n当前工作目录: ${context.workingDirectory}`);
    }

    parts.push(`
请执行以下审查任务:
${task}

审查要点：
1. 代码质量和可读性
2. 潜在的bug和逻辑问题
3. 安全隐患
4. 性能问题
5. 测试覆盖情况

请提供详细的审查报告，包括：
- 发现的问题（按严重程度排序）
- 改进建议
- 整体评价`);

    return parts.join('\n');
  }
}