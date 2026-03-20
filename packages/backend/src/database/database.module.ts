import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from './database.service';
import { Task } from './entities/task.entity';
import { Subtask } from './entities/subtask.entity';
import { Agent } from './entities/agent.entity';
import { Conversation } from './entities/conversation.entity';
import { Checkpoint } from './entities/checkpoint.entity';
import { ScheduledTask } from './entities/scheduled-task.entity';
import { ExecutionLog } from './entities/execution-log.entity';

const entities = [
  Task,
  Subtask,
  Agent,
  Conversation,
  Checkpoint,
  ScheduledTask,
  ExecutionLog,
];

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'sqlite',
        database: configService.getDatabasePath(),
        entities,
        synchronize: true,
        logging: configService.isDevelopment(),
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature(entities),
  ],
  providers: [DatabaseService],
  exports: [TypeOrmModule, DatabaseService],
})
export class DatabaseModule {}