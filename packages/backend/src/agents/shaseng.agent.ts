import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExecutableAgentBase, AgentExecutionContext } from './executable-agent-base';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';

/**
 * 沙和尚智能体 - 检查者
 * 负责：代码审查、测试验证、质量保证、安全检查
 * 所有行为由配置文件驱动
 */
@Injectable()
export class ShasengAgent extends ExecutableAgentBase implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  onModuleInit() {
    const config = this.configService.getAgentConfig('shaseng');
    if (config) {
      this.config = config;
      (this.logger as any).context = `${config.name}Agent`;
    }
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
      onInit: (sessionId) => this.logger.debug(`初始化审查会话: ${sessionId}`),
      onText: (_, text) => callbacks?.onText?.(text),
      onToolUse: (_, name, input) => {
        this.logger.debug(`审查工具: ${name}`);
        callbacks?.onToolUse?.(name, input);
      },
      onComplete: (_, result) => {
        this.logger.log(`审查完成: ${result.success ? '通过' : '发现问题'}`);
        callbacks?.onComplete?.(result);
      },
      onError: (_, error) => {
        this.logger.error(`审查失败: ${error}`);
        callbacks?.onError?.(error);
      },
    });
  }
}