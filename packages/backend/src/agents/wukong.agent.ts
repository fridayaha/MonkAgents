import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentConfig, CliExecutionResult } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { TeammateAgent } from '../team/teammate.agent';
import { TeamManager } from '../team/team.manager';
import { TaskListService } from '../team/task-list.service';
import { MailboxService } from '../team/mailbox.service';
import { AgentExecutionContext } from './executable-agent-base';

/**
 * 孙悟空智能体 - 主力执行者
 * 负责：代码编写、调试、测试、重构等具体技术任务
 * 继承 TeammateAgent 支持并行任务执行
 */
@Injectable()
export class WukongAgent extends TeammateAgent implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super({} as AgentConfig);
  }

  async onModuleInit() {
    const config = this.configService.getAgentConfig('wukong');
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
    // Register this agent with the team manager
    teamManager.registerTeammate(this);
  }

  /**
   * 执行任务 (兼容旧接口)
   * 注意：此方法用于非团队模式的直接执行
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