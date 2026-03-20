import { Injectable } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';

@Injectable()
export class TangsengAgent extends AgentBase {
  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'tangseng',
      name: '唐僧',
      emoji: '🙏',
      role: 'master',
      persona: '你是唐僧，团队的师父和领导者。',
      model: 'claude-opus-4-6',
      cli: {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
      },
      skills: [],
      mcps: [],
      capabilities: ['planning', 'coordination', 'review'],
      boundaries: ['不直接执行技术任务', '主要负责决策和协调'],
    };
    super(defaultConfig);
  }

  override async analyze(prompt: string): Promise<string> {
    this.logger.debug(`Analyzing prompt: ${prompt}`);
    this.status = 'thinking';

    // Phase 2: Implement actual CLI call
    // For now, return a placeholder
    const analysis = `[唐僧分析] 我收到了任务: "${prompt}"\n让我仔细思考一下如何分解这个任务...`;

    this.status = 'idle';
    return analysis;
  }

  override async execute(task: string): Promise<AgentExecutionResult> {
    this.logger.debug(`Executing task: ${task}`);

    // Tangseng primarily delegates, doesn't execute directly
    return {
      success: true,
      output: `[唐僧] 任务已规划，准备分配给团队成员。`,
    };
  }

  // Create execution plan
  async createPlan(_userPrompt: string): Promise<string[]> {
    this.status = 'thinking';

    // Phase 2: Use actual AI to create plan
    const steps = [
      '1. 分析用户需求',
      '2. 识别需要的技术能力',
      '3. 分配任务给合适的团队成员',
      '4. 监督执行过程',
      '5. 整合结果',
    ];

    this.status = 'idle';
    return steps;
  }
}