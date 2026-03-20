import { Injectable } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';

@Injectable()
export class BajieAgent extends AgentBase {
  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'bajie',
      name: '猪八戒',
      emoji: '🐷',
      role: 'assistant',
      persona: '你是猪八戒，团队的助手。',
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
  }

  override async analyze(prompt: string): Promise<string> {
    this.logger.debug(`Analyzing prompt: ${prompt}`);
    this.status = 'thinking';

    const analysis = `[猪八戒] 我收到了任务: "${prompt}"\n让我来帮忙处理一下！`;

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
      output: `[猪八戒] 任务完成！`,
    };
  }

  // Check if task is suitable for assistant level
  isSuitableTask(task: string): boolean {
    const assistantKeywords = ['文档', '注释', '格式', '整理', '运行', 'doc', 'format'];
    return assistantKeywords.some(keyword => task.toLowerCase().includes(keyword));
  }
}