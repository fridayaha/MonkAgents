import { Module, forwardRef } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { AgentsModule } from '../agents/agents.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    forwardRef(() => AgentsModule),
    forwardRef(() => TasksModule),
  ],
  providers: [WebSocketGateway, WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}