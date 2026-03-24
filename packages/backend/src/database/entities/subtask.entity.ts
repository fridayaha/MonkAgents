import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TaskStatus, AgentRole, ExecutionSummary } from '@monkagents/shared';
import { Task } from './task.entity';

@Entity('subtasks')
@Index('idx_subtasks_task_id', ['taskId'])
export class Subtask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
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

  /**
   * 执行摘要 - 记录任务执行的关键信息
   * 包括文件变更、产出、建议等
   */
  @Column('json', { nullable: true })
  executionSummary: ExecutionSummary;

  /**
   * handoff 次数 - 记录该子任务被重新分配的次数
   * 用于防止死锁
   */
  @Column('int', { default: 0 })
  handoffCount: number;

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