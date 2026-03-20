import { Injectable } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';

/**
 * 猪八戒智能体 - 助手
 * 负责：文档编写、格式整理、简单命令执行等辅助性任务
 */
@Injectable()
export class BajieAgent extends ExecutableAgentBase {
  private persona: string;

  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'bajie',
      name: '猪八戒',
      emoji: '🐷',
      role: 'assistant',
      persona: `你是猪八戒，团队的助手。你帮助完成辅助性的任务，比如编写文档、整理代码、运行简单命令等。

性格特点：
- 乐于助人，愿意承担杂务
- 有时有点懒散，但工作可靠
- 善于调节团队气氛
- 对分配的任务认真负责

工作方式：
1. 接受分配的辅助任务
2. 按要求完成文档编写、格式整理等工作
3. 协助运行测试和构建命令
4. 及时汇报任务进度
5. 在需要时提供支持

技能：文档编写、格式整理、简单命令执行`,
      model: 'claude-sonnet-4-6',
      cli: {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
      },
      skills: ['documentation', 'formatting', 'simple_tasks'],
      mcps: [],
      capabilities: ['documentation', 'file_operations', 'simple_commands'],
      boundaries: ['不处理复杂的编程任务', '不做技术决策'],
    };
    super(defaultConfig);
    this.persona = defaultConfig.persona;
  }

  /**
   * 检查任务是否匹配猪八戒的能力范围
   * 猪八戒擅长：文档编写、格式整理、简单命令执行
   */
  canHandle(task: string): boolean {
    const taskLower = task.toLowerCase();

    // 文档相关关键词
    const docKeywords = [
      '文档', 'document', 'doc', 'readme', '说明',
      '注释', 'comment', '文档化', 'documenting',
    ];

    // 格式整理关键词
    const formatKeywords = [
      '格式', 'format', '整理', 'organize', '清理',
      '美化', 'beautify', 'lint', '格式化',
    ];

    // 简单命令关键词
    const commandKeywords = [
      '运行', 'run', '执行', 'execute', '构建', 'build',
      '安装', 'install', 'npm', 'yarn', 'pnpm',
    ];

    // 辅助任务关键词
    const assistantKeywords = [
      '辅助', 'assist', '帮助', 'help', '简单', 'simple',
      '整理', 'organize', '检查', 'check',
    ];

    const allKeywords = [
      ...docKeywords,
      ...formatKeywords,
      ...commandKeywords,
      ...assistantKeywords,
    ];

    return allKeywords.some(keyword => taskLower.includes(keyword));
  }

  /**
   * 获取任务优先级权重
   * 猪八戒对辅助性任务优先级较高
   */
  getPriorityWeight(task: string): number {
    const taskLower = task.toLowerCase();

    // 猪八戒擅长的高优先级任务
    if (this.matchesDocumentation(taskLower)) return 0.9;
    if (this.matchesFormatting(taskLower)) return 0.85;
    if (this.matchesSimpleCommands(taskLower)) return 0.8;
    if (this.matchesAssistantTasks(taskLower)) return 0.75;

    // 默认权重
    return 0.4;
  }

  private matchesDocumentation(task: string): boolean {
    const keywords = ['文档', 'document', 'doc', 'readme', '注释', 'comment'];
    return keywords.some(k => task.includes(k));
  }

  private matchesFormatting(task: string): boolean {
    const keywords = ['格式', 'format', '整理', 'organize', '美化', 'beautify'];
    return keywords.some(k => task.includes(k));
  }

  private matchesSimpleCommands(task: string): boolean {
    const keywords = ['运行', 'run', '执行', 'execute', '构建', 'build', '安装', 'install'];
    return keywords.some(k => task.includes(k));
  }

  private matchesAssistantTasks(task: string): boolean {
    const keywords = ['辅助', 'assist', '帮助', 'help', '简单', 'simple'];
    return keywords.some(k => task.includes(k));
  }

  /**
   * 构建专属的系统提示
   */
  protected override getSystemPrompt(): string {
    return this.persona;
  }

  /**
   * 执行任务
   * 使用 CLI 进行实际的辅助任务执行
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
    this.logger.log(`猪八戒开始执行任务: ${context.prompt.substring(0, 50)}...`);

    const wrappedCallbacks = {
      onInit: (_sessionId: string) => {
        this.logger.debug(`初始化会话: ${_sessionId}`);
      },
      onText: (_sessionId: string, text: string) => {
        callbacks?.onText?.(text);
      },
      onToolUse: (_sessionId: string, name: string, input: Record<string, unknown>) => {
        this.logger.debug(`使用工具: ${name}`);
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_sessionId: string, result: CliExecutionResult) => {
        this.logger.log(`任务完成: ${result.success ? '成功' : '失败'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_sessionId: string, error: string) => {
        this.logger.error(`任务失败: ${error}`);
        callbacks?.onError?.(error);
      },
    };

    return super.execute(context, wrappedCallbacks);
  }
}