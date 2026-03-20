import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebugController } from './debug.controller';
import { Task } from '../database/entities/task.entity';
import { ExecutionLog } from '../database/entities/execution-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task, ExecutionLog])],
  controllers: [DebugController],
  exports: [],
})
export class DebugModule {}