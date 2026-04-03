import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamManager } from './team.manager';
import { TaskListService } from './task-list.service';
import { MailboxService } from './mailbox.service';
import { TeamLeadAgent } from './team-lead.agent';
import { HeartbeatService } from './heartbeat.service';
import { GoalService } from './goal.service';
import { AgentContextService } from './agent-context.service';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { ConfigModule } from '../config/config.module';
import { Agent } from '../database/entities/agent.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agent]),
    RedisModule,
    ConfigModule,
  ],
  providers: [
    TeamManager,
    TaskListService,
    MailboxService,
    TeamLeadAgent,
    HeartbeatService,
    GoalService,
    AgentContextService,
  ],
  exports: [
    TeamManager,
    TaskListService,
    MailboxService,
    TeamLeadAgent,
    HeartbeatService,
    GoalService,
    AgentContextService,
  ],
})
export class TeamModule implements OnModuleInit {
  constructor(
    teamManager: TeamManager,
    private readonly taskListService: TaskListService,
    private readonly mailboxService: MailboxService,
    private readonly redisService: RedisService,
    private readonly heartbeatService: HeartbeatService,
    private readonly goalService: GoalService,
  ) {
    // TeamManager is used implicitly through module initialization
    void teamManager;
  }

  async onModuleInit() {
    // Initialize task list service with Redis
    if (this.redisService) {
      this.taskListService.setRedisService(this.redisService);
      await this.mailboxService.setRedisService(this.redisService);
      this.heartbeatService.setRedisService(this.redisService);
      this.goalService.setRedisService(this.redisService);
    }
  }
}