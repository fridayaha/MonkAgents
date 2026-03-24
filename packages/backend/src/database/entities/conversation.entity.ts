import {
  Entity,
  Column,
  CreateDateColumn,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { MessageSender, MessageType } from '@monkagents/shared';

@Entity('conversations')
@Index('idx_conversations_session_id', ['sessionId'])
@Index('idx_conversations_task_id', ['taskId'])
export class Conversation {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  taskId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  subtaskId: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  sender: MessageSender;

  @Column({ type: 'varchar', length: 64 })
  senderId: string;

  @Column({ type: 'varchar', length: 100 })
  senderName: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'text',
  })
  type: MessageType;

  @Column('text')
  content: string;

  @Column('json', { nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}