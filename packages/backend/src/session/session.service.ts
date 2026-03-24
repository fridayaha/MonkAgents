import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Session } from '../database/entities/session.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Task } from '../database/entities/task.entity';
import { SessionStatus, CreateSessionInput, SessionSummary, SessionDetail, MessageType, MessageSender } from '@monkagents/shared';

/**
 * Input type for creating a message
 */
export interface CreateMessageInput {
  id?: string;
  taskId?: string;
  subtaskId?: string;
  sender: MessageSender;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const session = this.sessionRepository.create({
      id: uuidv4(),
      title: input.title,
      status: 'active' as SessionStatus,
      workingDirectory: input.workingDirectory,
    });

    const saved = await this.sessionRepository.save(session);
    this.logger.log(`Created session: ${saved.id}`);

    return saved;
  }

  async findAll(): Promise<SessionSummary[]> {
    const sessions = await this.sessionRepository.find({
      order: { updatedAt: 'DESC' },
    });

    const summaries: SessionSummary[] = [];

    for (const session of sessions) {
      const messageCount = await this.conversationRepository.count({
        where: { sessionId: session.id },
      });

      const taskCount = await this.taskRepository.count({
        where: { sessionId: session.id },
      });

      summaries.push({
        id: session.id,
        title: session.title ?? undefined,
        status: session.status,
        workingDirectory: session.workingDirectory ?? undefined,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount,
        taskCount,
      });
    }

    return summaries;
  }

  async findOne(id: string): Promise<SessionDetail> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${id}`);
    }

    // Get messages from database
    const messages = await this.conversationRepository.find({
      where: { sessionId: id },
      order: { createdAt: 'ASC' },
    });

    // Get tasks from database
    const tasks = await this.taskRepository.find({
      where: { sessionId: id },
      order: { createdAt: 'DESC' },
    });

    // Get counts
    const messageCount = messages.length;
    const taskCount = tasks.length;

    return {
      id: session.id,
      title: session.title ?? undefined,
      status: session.status,
      workingDirectory: session.workingDirectory ?? undefined,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount,
      taskCount,
      config: {
        workingDirectory: session.workingDirectory ?? undefined,
      },
      messages: messages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        taskId: m.taskId ?? undefined,
        subtaskId: m.subtaskId ?? undefined,
        sender: m.sender,
        senderId: m.senderId,
        senderName: m.senderName,
        type: m.type,
        content: m.content,
        metadata: m.metadata ?? undefined,
        createdAt: m.createdAt,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        sessionId: t.sessionId,
        userPrompt: t.userPrompt,
        status: t.status,
        priority: t.priority,
        assignedAgents: t.assignedAgents ?? [],
        subtasks: [],
        result: t.result ?? undefined,
        error: t.error ?? undefined,
        createdAt: t.createdAt,
        startedAt: t.startedAt ?? undefined,
        completedAt: t.completedAt ?? undefined,
      })),
    };
  }

  async update(id: string, updates: Partial<Pick<Session, 'title' | 'status'>>): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${id}`);
    }

    Object.assign(session, updates);
    const saved = await this.sessionRepository.save(session);

    return saved;
  }

  async remove(id: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${id}`);
    }

    // Delete related messages
    await this.conversationRepository.delete({ sessionId: id });

    // Delete related tasks
    await this.taskRepository.delete({ sessionId: id });

    // Remove session
    await this.sessionRepository.remove(session);
    this.logger.log(`Deleted session: ${id}`);
  }

  // Internal method to update session stats
  async updateMessageCount(sessionId: string): Promise<void> {
    // Just touch the session to update updatedAt
    await this.sessionRepository.update(sessionId, {
      updatedAt: new Date(),
    });
  }

  async updateTaskCount(sessionId: string): Promise<void> {
    // Just touch the session to update updatedAt
    await this.sessionRepository.update(sessionId, {
      updatedAt: new Date(),
    });
  }

  /**
   * Add a single message to the conversation table
   * This is the primary method for persisting messages to MySQL
   */
  async addMessage(sessionId: string, input: CreateMessageInput): Promise<Conversation> {
    // Create the entity object - always include id
    const entity: Partial<Conversation> = {
      id: input.id || `msg-${uuidv4()}`,  // Always generate ID if not provided
      sessionId,
      sender: input.sender,
      senderId: input.senderId,
      senderName: input.senderName,
      type: input.type,
      content: input.content,
    };

    // Only set optional fields if they have values
    if (input.taskId) {
      entity.taskId = input.taskId;
    }
    if (input.subtaskId) {
      entity.subtaskId = input.subtaskId;
    }
    if (input.metadata) {
      entity.metadata = input.metadata;
    }

    // Use repository.save with the entity object directly
    const saved = await this.conversationRepository.save(entity as Conversation);

    // Update session's updatedAt timestamp
    await this.updateMessageCount(sessionId);

    return saved;
  }

  /**
   * Add multiple messages to the conversation table in batch
   */
  async addMessages(sessionId: string, inputs: CreateMessageInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const entities: Partial<Conversation>[] = inputs.map(input => {
      const entity: Partial<Conversation> = {
        id: input.id || `msg-${uuidv4()}`,  // Always generate ID if not provided
        sessionId,
        sender: input.sender,
        senderId: input.senderId,
        senderName: input.senderName,
        type: input.type,
        content: input.content,
      };

      if (input.taskId) {
        entity.taskId = input.taskId;
      }
      if (input.subtaskId) {
        entity.subtaskId = input.subtaskId;
      }
      if (input.metadata) {
        entity.metadata = input.metadata;
      }

      return entity;
    });

    await this.conversationRepository.save(entities as Conversation[]);

    // Update session's updatedAt timestamp
    await this.updateMessageCount(sessionId);
  }

  /**
   * Get messages for a session from the database
   */
  async getSessionMessages(sessionId: string, limit?: number): Promise<Conversation[]> {
    const query = this.conversationRepository
      .createQueryBuilder('conversation')
      .where('conversation.sessionId = :sessionId', { sessionId })
      .orderBy('conversation.createdAt', 'ASC');

    if (limit) {
      query.limit(limit);
    }

    return query.getMany();
  }

  /**
   * Update a message's metadata by ID
   * Used for updating tool_use message status from 'in progress' to 'complete'
   */
  async updateMessageMetadata(messageId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.conversationRepository
      .createQueryBuilder()
      .update(Conversation)
      .set({ metadata: () => ':metadata' })
      .setParameter('metadata', JSON.stringify(metadata))
      .where('id = :id', { id: messageId })
      .execute();
  }
}