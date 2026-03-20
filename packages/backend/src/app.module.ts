import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AgentsModule } from './agents/agents.module';
import { SessionModule } from './session/session.module';
import { WebSocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    // Database
    DatabaseModule,

    // Configuration
    ConfigModule,

    // Features
    AgentsModule,
    SessionModule,
    WebSocketModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}