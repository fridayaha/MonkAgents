import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';

/**
 * 孙悟空智能体 - 主力执行者
 * 负责：代码编写、调试、测试、重构等具体技术任务
 * 所有行为由配置文件驱动
 */
@Injectable()
export class WukongAgent extends ExecutableAgentBase implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  onModuleInit() {
    const config = this.configService.getAgentConfig('wukong');
    if (config) {
      this.config = config;
      (this.logger as any).context = `${config.name}Agent`;
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
      onInit: (sessionId) => this.logger.debug(`初始化会话: ${sessionId}`),
      onText: (_, text) => callbacks?.onText?.(text),
      onToolUse: (_, name, input) => {
        this.logger.debug(`使用工具: ${name}`);
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_, result) => {
        this.logger.log(`任务完成: ${result.success ? '成功' : '失败'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_, error) => {
        this.logger.error(`任务失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}