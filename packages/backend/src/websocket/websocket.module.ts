import { Module, forwardRef } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { AgentsModule } from '../agents/agents.module';
import { TasksModule } from '../tasks/tasks.module';
import { SessionModule } from '../session/session.module';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [
    forwardRef(() => AgentsModule),
    forwardRef(() => TasksModule),
    forwardRef(() => SessionModule),
    forwardRef(() => TeamModule),
  ],
  providers: [WebSocketGateway, WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}