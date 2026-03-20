import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledTasksController } from './scheduled-tasks.controller';
import { ScheduledTask } from '../database/entities/scheduled-task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduledTask])],
  controllers: [ScheduledTasksController],
  exports: [],
})
export class SchedulerModule {}