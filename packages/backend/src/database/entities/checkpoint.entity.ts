import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('checkpoints')
@Index('idx_checkpoints_session_id', ['sessionId'])
@Index('idx_checkpoints_task_id', ['taskId'])
export class Checkpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column({ nullable: true })
  taskId: string;

  @Column()
  agentId: string;

  @Column('text')
  state: string;

  @Column('text', { nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}