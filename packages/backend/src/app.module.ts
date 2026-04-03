import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { CliModule } from './cli/cli.module';
import { AgentsModule } from './agents/agents.module';
import { SessionModule } from './session/session.module';
import { TasksModule } from './tasks/tasks.module';
import { WebSocketModule } from './websocket/websocket.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DebugModule } from './debug/debug.module';
import { TeamModule } from './team/team.module';
import { AuditModule } from './audit/audit.module';
import { SkillsModule } from './skills/skills.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    // Database
    DatabaseModule,

    // Redis Cache
    RedisModule,

    // Configuration
    ConfigModule,

    // CLI Process Management
    CliModule,

    // Audit logging
    AuditModule,

    // Skills directory
    SkillsModule,

    // Workspace (worktree)
    WorkspaceModule,

    // Features
    AgentsModule,
    SessionModule,
    TasksModule,
    WebSocketModule,
    SchedulerModule,
    DebugModule,

    // Team-based agent execution
    TeamModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}