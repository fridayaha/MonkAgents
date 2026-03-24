import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { BaseAgentService } from './base-agent.service';

/**
 * 沙和尚智能体 - 检查者
 * 负责：代码审查、测试验证、质量保证、安全检查
 * 所有行为由配置文件驱动
 */
@Injectable()
export class ShasengAgent extends BaseAgentService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    const config = this.configService.getAgentConfig('shaseng');
    if (config) {
      this.initialize(config);
    }
    await super.onModuleInit(); // Call parent implementation after config is loaded
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
    this.logger.log(`沙和尚开始审查任务: ${context.prompt.substring(0, 50)}...`);

    return super.execute(context, {
      onText: (_: string, text: string) => callbacks?.onText?.(text),
      onToolUse: (_: string, name: string, input: Record<string, unknown>) => {
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_: string, result: CliExecutionResult) => {
        this.logger.log(`审查完成: ${result.success ? '通过' : '发现问题'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_: string, error: string) => {
        this.logger.error(`审查失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}