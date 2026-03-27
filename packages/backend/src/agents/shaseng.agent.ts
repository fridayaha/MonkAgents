import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { TeammateAgent } from '../team/teammate.agent';
import { TeamManager } from '../team/team.manager';
import { TaskListService } from '../team/task-list.service';
import { MailboxService } from '../team/mailbox.service';
import { AgentExecutionContext } from './executable-agent-base';

/**
 * 沙和尚智能体 - 检查者
 * 负责：代码审查、测试验证、质量保证、安全检查
 * 继承 TeammateAgent 支持并行任务执行
 */
@Injectable()
export class ShasengAgent extends TeammateAgent implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    const config = this.configService.getAgentConfig('shaseng');
    if (config) {
      this.initializeAgent(config);
      (this.logger as any).context = `${config.name}Agent`;
    }
    this.logger.log(`${this.getName()} initialized`);
  }

  /**
   * Set team services for parallel execution
   */
  setTeamServices(
    taskListService: TaskListService,
    mailboxService: MailboxService,
    teamManager: TeamManager,
  ): void {
    super.setTeamServices(taskListService, mailboxService, teamManager);
    teamManager.registerTeammate(this);
  }

  /**
   * 执行审查任务 (兼容旧接口)
   */
  async runDirect(
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