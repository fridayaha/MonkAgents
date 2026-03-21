import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SessionStatus } from '@monkagents/shared';

@Entity('sessions')
@Index('idx_sessions_status', ['status'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'active',
  })
  status: SessionStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  workingDirectory: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}