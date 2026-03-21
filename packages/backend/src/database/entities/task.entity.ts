import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { TaskStatus, TaskPriority } from '@monkagents/shared';
import { Subtask } from './subtask.entity';

@Entity('tasks')
@Index('idx_tasks_session_id', ['sessionId'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column('text')
  userPrompt: string;

  @Column({
    type: 'varchar',
    default: 'pending',
  })
  status: TaskStatus;

  @Column({
    type: 'varchar',
    default: 'normal',
  })
  priority: TaskPriority;

  @Column('simple-array', { nullable: true })
  assignedAgents: string[];

  @Column('text', { nullable: true })
  result: string;

  @Column('text', { nullable: true })
  error: string;

  @OneToMany(() => Subtask, (subtask) => subtask.task, { cascade: true })
  subtasks: Subtask[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}