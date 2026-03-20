import { Injectable } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';

@Injectable()
export class WukongAgent extends AgentBase {
  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'wukong',
      name: '孙悟空',
      emoji: '🐵',
      role: 'executor',
      persona: '你是孙悟空，团队的主力执行者。',
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
  }

  override async analyze(prompt: string): Promise<string> {
    this.logger.debug(`Analyzing prompt: ${prompt}`);
    this.status = 'thinking';

    // Phase 2: Implement actual CLI call
    const analysis = `[孙悟空分析] 我来看看这个任务: "${prompt}"\n这个任务我可以处理！`;

    this.status = 'idle';
    return analysis;
  }

  override async execute(task: string): Promise<AgentExecutionResult> {
    this.logger.debug(`Executing task: ${task}`);
    this.status = 'executing';

    // Phase 2: Implement actual CLI call
    // const result = await this.executeCli(task);

    this.status = 'idle';
    return {
      success: true,
      output: `[孙悟空] 任务执行完成！`,
    };
  }

  // Check if task matches capabilities
  canHandle(task: string): boolean {
    const codeKeywords = ['代码', '实现', '编写', 'debug', 'fix', 'test', '重构'];
    return codeKeywords.some(keyword => task.toLowerCase().includes(keyword));
  }
}