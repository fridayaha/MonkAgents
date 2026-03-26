import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { TaskPlanner } from './task-planner';
import { TangsengAgent } from './tangseng.agent';
import { WukongAgent } from './wukong.agent';
import { BajieAgent } from './bajie.agent';
import { ShasengAgent } from './shaseng.agent';
import { RulaiAgent } from './rulai.agent';
import { AgentMentionService } from './agent-mention.service';
import { PermissionService } from './permission.service';
import { Agent } from '../database/entities/agent.entity';
import { ConfigModule } from '../config/config.module';
import { SessionModule } from '../session/session.module';
import { RedisModule } from '../redis/redis.module';
import { AgentRegistry } from './agent-registry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agent]),
    ConfigModule,
    SessionModule,
    RedisModule,
  ],
  providers: [
    AgentRegistry, // New agent registry
    AgentsService,
    TaskPlanner,
    TangsengAgent,
    WukongAgent,
    BajieAgent,
    ShasengAgent,
    RulaiAgent,
    AgentMentionService,
    PermissionService,
  ],
  controllers: [AgentsController],
  exports: [
    AgentRegistry, // Export the registry
    AgentsService,
    TaskPlanner,
    TangsengAgent,
    WukongAgent,
    BajieAgent,
    ShasengAgent,
    RulaiAgent,
    AgentMentionService,
    PermissionService,
  ],
})
export class AgentsModule {}