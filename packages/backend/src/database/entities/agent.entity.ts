import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AgentStatus, AgentRole } from '@monkagents/shared';

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  agentId: string;

  @Column()
  name: string;

  @Column()
  emoji: string;

  @Column({
    type: 'varchar',
  })
  role: AgentRole;

  @Column('text')
  persona: string;

  @Column()
  model: string;

  @Column('json', { nullable: true })
  cli: {
    command: string;
    args: string[];
  };

  @Column('simple-array', { nullable: true })
  skills: string[];

  @Column('simple-array', { nullable: true })
  mcps: string[];

  @Column('simple-array', { nullable: true })
  capabilities: string[];

  @Column('simple-array', { nullable: true })
  boundaries: string[];

  @Column({
    type: 'varchar',
    default: 'offline',
  })
  status: AgentStatus;

  @Column({ type: 'varchar', nullable: true })
  currentTaskId: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastActivity: Date;

  @Column({ type: 'int', nullable: true })
  processPid: number;

  @Column({ type: 'datetime', nullable: true })
  processStartedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}