import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TaskStatus, AgentRole } from '@monkagents/shared';
import { Task } from './task.entity';

@Entity('subtasks')
export class Subtask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  taskId: string;

  @Column({ nullable: true })
  parentId: string;

  @Column()
  agentId: string;

  @Column({
    type: 'varchar',
  })
  agentRole: AgentRole;

  @Column('text')
  description: string;

  @Column({
    type: 'varchar',
    default: 'pending',
  })
  status: TaskStatus;

  @Column('int', { default: 0 })
  order: number;

  @Column('text', { nullable: true })
  result: string;

  @ManyToOne(() => Task, (task) => task.subtasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date;
}