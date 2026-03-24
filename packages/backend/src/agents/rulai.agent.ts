import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { BaseAgentService } from './base-agent.service';

/**
 * 如来佛祖智能体 - 资深顾问
 * 负责：架构设计、技术咨询、战略指导、复杂问题解决
 * 使用更强大的 Opus 模型
 * 所有行为由配置文件驱动
 */
@Injectable()
export class RulaiAgent extends BaseAgentService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    await super.onModuleInit(); // Call parent implementation
    const config = this.configService.getAgentConfig('rulai');
    if (config) {
      this.initialize(config);
    }
  }

  /**
   * 执行咨询任务
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
    this.logger.log(`如来佛祖开始咨询任务: ${context.prompt.substring(0, 50)}...`);

    return super.execute(context, {
      onText: (_: string, text: string) => callbacks?.onText?.(text),
      onToolUse: (_: string, name: string, input: Record<string, unknown>) => {
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_: string, result: CliExecutionResult) => {
        this.logger.log(`咨询完成`);
        callbacks?.onComplete?.(result);
      },
      onError: (_: string, error: string) => {
        this.logger.error(`咨询失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}