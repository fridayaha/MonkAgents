import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { Subtask } from './entities/subtask.entity';
import { Agent } from './entities/agent.entity';
import { Conversation } from './entities/conversation.entity';
import { Checkpoint } from './entities/checkpoint.entity';
import { ScheduledTask } from './entities/scheduled-task.entity';
import { ExecutionLog } from './entities/execution-log.entity';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectRepository(Task)
    public readonly taskRepo: Repository<Task>,
    @InjectRepository(Subtask)
    public readonly subtaskRepo: Repository<Subtask>,
    @InjectRepository(Agent)
    public readonly agentRepo: Repository<Agent>,
    @InjectRepository(Conversation)
    public readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Checkpoint)
    public readonly checkpointRepo: Repository<Checkpoint>,
    @InjectRepository(ScheduledTask)
    public readonly scheduledTaskRepo: Repository<ScheduledTask>,
    @InjectRepository(ExecutionLog)
    public readonly executionLogRepo: Repository<ExecutionLog>,
  ) {}

  async onModuleInit() {
    this.logger.log('Database initialized');
  }
}