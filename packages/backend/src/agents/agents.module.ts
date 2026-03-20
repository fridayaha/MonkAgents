import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { TaskPlanner } from './task-planner';
import { TangsengAgent } from './tangseng.agent';
import { Agent } from '../database/entities/agent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Agent])],
  providers: [AgentsService, TaskPlanner, TangsengAgent],
  controllers: [AgentsController],
  exports: [AgentsService, TaskPlanner, TangsengAgent],
})
export class AgentsModule {}