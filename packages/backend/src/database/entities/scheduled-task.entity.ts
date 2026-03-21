import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ScheduleStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ScheduleType = 'once' | 'interval' | 'cron';

@Entity('scheduled_tasks')
@Index('idx_scheduled_tasks_session_id', ['sessionId'])
export class ScheduledTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
  })
  type: ScheduleType;

  @Column('text')
  prompt: string;

  @Column({ type: 'datetime', nullable: true })
  scheduledAt: Date;

  @Column('int', { nullable: true })
  intervalSeconds: number;

  @Column('text', { nullable: true })
  cronExpression: string;

  @Column({
    type: 'varchar',
    default: 'pending',
  })
  status: ScheduleStatus;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt: Date;

  @Column({ type: 'datetime', nullable: true })
  nextRunAt: Date;

  @Column('int', { default: 0 })
  runCount: number;

  @Column('int', { nullable: true })
  maxRuns: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}