import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Entity('execution_logs')
export class ExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  @Index()
  taskId: string;

  @Column({ nullable: true })
  @Index()
  subtaskId: string;

  @Column({ nullable: true })
  @Index()
  agentId: string;

  @Column({ nullable: true })
  @Index()
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