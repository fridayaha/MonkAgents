import { Injectable } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';

@Injectable()
export class ShasengAgent extends AgentBase {
  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'shaseng',
      name: '沙僧',
      emoji: '🧑‍🦲',
      role: 'inspector',
      persona: '你是沙僧，团队的检查者。',
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
  }

  override async analyze(prompt: string): Promise<string> {
    this.logger.debug(`Analyzing prompt: ${prompt}`);
    this.status = 'thinking';

    const analysis = `[沙僧] 让我仔细检查一下: "${prompt}"\n需要确保代码质量！`;

    this.status = 'idle';
    return analysis;
  }

  override async execute(task: string): Promise<AgentExecutionResult> {
    this.logger.debug(`Executing task: ${task}`);
    this.status = 'executing';

    // Phase 2: Implement actual CLI call
    this.status = 'idle';
    return {
      success: true,
      output: `[沙僧] 检查完成！代码质量良好。`,
    };
  }

  // Review code and provide feedback
  async reviewCode(_code: string): Promise<{ issues: string[]; suggestions: string[] }> {
    this.status = 'thinking';

    // Phase 2: Implement actual review
    const result = {
      issues: [] as string[],
      suggestions: ['建议添加注释', '建议增加测试覆盖率'] as string[],
    };

    this.status = 'idle';
    return result;
  }
}