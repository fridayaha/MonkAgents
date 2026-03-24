import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { BaseAgentService } from './base-agent.service';

/**
 * 孙悟空智能体 - 主力执行者
 * 负责：代码编写、调试、测试、重构等具体技术任务
 * 所有行为由配置文件驱动
 */
@Injectable()
export class WukongAgent extends BaseAgentService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    await super.onModuleInit(); // Call parent implementation
    const config = this.configService.getAgentConfig('wukong');
    if (config) {
      this.initialize(config);
    }
  }

  /**
   * 执行任务
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

    return super.execute(context, {
      onText: (_: string, text: string) => callbacks?.onText?.(text),
      onToolUse: (_: string, name: string, input: Record<string, unknown>) => {
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_: string, result: CliExecutionResult) => {
        this.logger.log(`任务完成: ${result.success ? '成功' : '失败'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_: string, error: string) => {
        this.logger.error(`任务失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}