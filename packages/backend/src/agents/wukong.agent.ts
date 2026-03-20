import { Injectable } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';

/**
 * 孙悟空智能体 - 主力执行者
 * 负责：代码编写、调试、测试、重构等具体技术任务
 */
@Injectable()
export class WukongAgent extends ExecutableAgentBase {
  private persona: string;

  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'wukong',
      name: '孙悟空',
      emoji: '🐵',
      role: 'executor',
      persona: `你是孙悟空，团队的主力执行者。你拥有强大的技术能力，能够完成各种复杂的编程和技术任务。

性格特点：
- 技术能力出众，解决问题的能力强
- 反应迅速，执行效率高
- 有时会过于自信，但关键时刻值得信赖
- 对技术挑战充满热情

工作方式：
1. 快速理解任务要求
2. 选择最合适的技术方案
3. 高效执行，注重代码质量
4. 遇到问题时主动寻求帮助
5. 完成后进行自我检查

技能：编码、调试、测试、重构`,
      model: 'claude-sonnet-4-6',
      cli: {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
      },
      skills: ['coding', 'debugging', 'testing', 'refactoring'],
      mcps: [],
      capabilities: ['code_generation', 'code_review', 'debugging', 'testing', 'file_operations'],
      boundaries: ['不做架构决策（需要师父同意）', '遇到重大问题需要汇报'],
    };
    super(defaultConfig);
    this.persona = defaultConfig.persona;
  }

  /**
   * 检查任务是否匹配孙悟空的能力范围
   * 孙悟空擅长：代码编写、调试、测试、重构等具体技术任务
   */
  canHandle(task: string): boolean {
    const taskLower = task.toLowerCase();

    // 代码相关关键词
    const codeKeywords = [
      '代码', '实现', '编写', '写一个', '开发',
      'code', 'implement', 'write', 'develop',
      'function', 'class', 'module', 'component',
      'api', 'interface', 'service',
    ];

    // 调试相关关键词
    const debugKeywords = [
      '调试', 'debug', '修复', 'fix', 'bug', '错误', 'error',
      '问题', 'issue', '异常', 'exception',
    ];

    // 测试相关关键词
    const testKeywords = [
      '测试', 'test', '单元测试', 'unit test',
      '集成测试', 'integration test',
    ];

    // 重构相关关键词
    const refactorKeywords = [
      '重构', 'refactor', '优化', 'optimize',
      '改进', 'improve', '清理', 'clean',
    ];

    // 文件操作关键词
    const fileKeywords = [
      '创建文件', 'create file', '修改文件', 'modify file',
      '读取文件', 'read file', '删除文件', 'delete file',
    ];

    // 检查是否匹配任何能力
    const allKeywords = [
      ...codeKeywords,
      ...debugKeywords,
      ...testKeywords,
      ...refactorKeywords,
      ...fileKeywords,
    ];

    return allKeywords.some(keyword => taskLower.includes(keyword));
  }

  /**
   * 获取任务优先级权重
   * 用于任务分配时确定最优智能体
   */
  getPriorityWeight(task: string): number {
    const taskLower = task.toLowerCase();

    // 孙悟空擅长的高优先级任务
    if (this.matchesCoding(taskLower)) return 0.95;
    if (this.matchesDebugging(taskLower)) return 0.9;
    if (this.matchesTesting(taskLower)) return 0.85;
    if (this.matchesRefactoring(taskLower)) return 0.8;

    // 默认权重
    return 0.5;
  }

  private matchesCoding(task: string): boolean {
    const keywords = ['代码', '实现', '编写', 'code', 'implement', 'write'];
    return keywords.some(k => task.includes(k));
  }

  private matchesDebugging(task: string): boolean {
    const keywords = ['调试', 'debug', '修复', 'fix', 'bug'];
    return keywords.some(k => task.includes(k));
  }

  private matchesTesting(task: string): boolean {
    const keywords = ['测试', 'test'];
    return keywords.some(k => task.includes(k));
  }

  private matchesRefactoring(task: string): boolean {
    const keywords = ['重构', 'refactor', '优化', 'optimize'];
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
   * 使用 CLI 进行实际的代码执行
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
    this.logger.log(`孙悟空开始执行任务: ${context.prompt.substring(0, 50)}...`);

    // 包装回调，添加智能体名称前缀
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