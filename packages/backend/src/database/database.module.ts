import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from './database.service';
import { Session } from './entities/session.entity';
import { Task } from './entities/task.entity';
import { Subtask } from './entities/subtask.entity';
import { Agent } from './entities/agent.entity';
import { Conversation } from './entities/conversation.entity';
import { Checkpoint } from './entities/checkpoint.entity';
import { ScheduledTask } from './entities/scheduled-task.entity';
import { ExecutionLog } from './entities/execution-log.entity';

const entities = [
  Session,
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
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.getDatabaseConfig();

        return {
          type: 'mysql',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          entities,
          synchronize: true, // Auto-create tables in development
          logging: ['error', 'schema'], // Only log errors and schema changes, not SQL queries
          charset: 'utf8mb4',
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature(entities),
  ],
  providers: [DatabaseService],
  exports: [TypeOrmModule, DatabaseService],
})
export class DatabaseModule {}