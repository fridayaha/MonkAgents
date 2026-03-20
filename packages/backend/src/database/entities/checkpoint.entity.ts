import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('checkpoints')
export class Checkpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  sessionId: string;

  @Column({ nullable: true })
  @Index()
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