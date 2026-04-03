import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../database/entities/session.entity';
import { Task } from '../database/entities/task.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { SessionRecoveryService } from './session-recovery.service';
import { RedisModule } from '../redis/redis.module';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Task]),
    RedisModule,
    TeamModule,
  ],
  providers: [SessionService, SessionRecoveryService],
  controllers: [SessionController],
  exports: [SessionService, SessionRecoveryService],
})
export class SessionModule {}