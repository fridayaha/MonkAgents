import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CliModule } from './cli/cli.module';
import { AgentsModule } from './agents/agents.module';
import { SessionModule } from './session/session.module';
import { TasksModule } from './tasks/tasks.module';
import { WebSocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    // Database
    DatabaseModule,

    // Configuration
    ConfigModule,

    // CLI Process Management
    CliModule,

    // Features
    AgentsModule,
    SessionModule,
    TasksModule,
    WebSocketModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}