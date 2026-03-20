import { Injectable } from '@nestjs/common';
import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig } from '@monkagents/shared';

@Injectable()
export class RulaiAgent extends AgentBase {
  constructor() {
    const defaultConfig: AgentConfig = {
      id: 'rulai',
      name: '如来佛祖',
      emoji: '🧘',
      role: 'advisor',
      persona: '你是如来佛祖，团队的资深顾问。',
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
  }

  override async analyze(prompt: string): Promise<string> {
    this.logger.debug(`Analyzing prompt: ${prompt}`);
    this.status = 'thinking';

    const analysis = `[如来佛祖] 我来审视这个问题: "${prompt}"\n让我从更高层面来思考...`;

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
      output: `[如来佛祖] 这是我的建议...`,
    };
  }

  // Provide architectural guidance
  async provideGuidance(_context: string): Promise<string> {
    this.status = 'thinking';

    // Phase 2: Implement actual AI advice
    const guidance = '根据我的经验，我建议...';

    this.status = 'idle';
    return guidance;
  }
}