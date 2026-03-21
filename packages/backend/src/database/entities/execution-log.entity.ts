import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Entity('execution_logs')
@Index('idx_execution_logs_task_id', ['taskId'])
@Index('idx_execution_logs_subtask_id', ['subtaskId'])
@Index('idx_execution_logs_agent_id', ['agentId'])
@Index('idx_execution_logs_session_id', ['sessionId'])
export class ExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  taskId: string;

  @Column({ nullable: true })
  subtaskId: string;

  @Column({ nullable: true })
  agentId: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({
    type: 'varchar',
    default: 'info',
  })
  level: LogLevel;

  @Column('text')
  message: string;

  @Column('json', { nullable: true })
  metadata: Record<string, unknown>;

  @Column('text', { nullable: true })
  stackTrace: string;

  @CreateDateColumn()
  createdAt: Date;
}