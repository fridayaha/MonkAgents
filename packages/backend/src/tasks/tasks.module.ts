import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { Task } from '../database/entities/task.entity';
import { Subtask } from '../database/entities/subtask.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task, Subtask])],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}