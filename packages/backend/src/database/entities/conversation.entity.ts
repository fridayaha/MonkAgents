import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { MessageSender, MessageType } from '@monkagents/shared';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  sessionId: string;

  @Column({ nullable: true })
  @Index()
  taskId: string;

  @Column({ nullable: true })
  subtaskId: string;

  @Column({
    type: 'varchar',
  })
  sender: MessageSender;

  @Column()
  senderId: string;

  @Column()
  senderName: string;

  @Column({
    type: 'varchar',
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