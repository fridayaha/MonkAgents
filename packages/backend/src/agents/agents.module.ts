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
import { AgentCollaborationService } from './agent-collaboration.service';
import { Agent } from '../database/entities/agent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Agent])],
  providers: [
    AgentsService,
    TaskPlanner,
    TangsengAgent,
    WukongAgent,
    BajieAgent,
    ShasengAgent,
    RulaiAgent,
    AgentMentionService,
    AgentCollaborationService,
  ],
  controllers: [AgentsController],
  exports: [
    AgentsService,
    TaskPlanner,
    TangsengAgent,
    WukongAgent,
    BajieAgent,
    ShasengAgent,
    RulaiAgent,
    AgentMentionService,
    AgentCollaborationService,
  ],
})
export class AgentsModule {}