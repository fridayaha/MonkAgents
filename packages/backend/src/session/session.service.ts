import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Conversation } from '../database/entities/conversation.entity';
import { Task } from '../database/entities/task.entity';
import { SessionStatus, CreateSessionInput, SessionSummary, SessionDetail } from '@monkagents/shared';

export interface Session {
  id: string;
  title?: string;
  status: SessionStatus;
  workingDirectory: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  taskCount: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private sessions: Map<string, Session> = new Map();

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const id = uuidv4();
    const now = new Date();

    const session: Session = {
      id,
      title: input.title,
      status: 'active',
      workingDirectory: input.workingDirectory,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      taskCount: 0,
    };

    this.sessions.set(id, session);
    this.logger.log(`Created session: ${id}`);

    return session;
  }

  async findAll(): Promise<SessionSummary[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        workingDirectory: session.workingDirectory,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        taskCount: session.taskCount,
      }));
  }

  async findOne(id: string): Promise<SessionDetail> {
    const session = this.sessions.get(id);
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

    return {
      ...session,
      config: {
        workingDirectory: session.workingDirectory,
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
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundException(`Session not found: ${id}`);
    }

    Object.assign(session, updates, { updatedAt: new Date() });
    this.sessions.set(id, session);

    return session;
  }

  async remove(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundException(`Session not found: ${id}`);
    }

    // Delete related messages
    await this.conversationRepository.delete({ sessionId: id });

    // Delete related tasks
    await this.taskRepository.delete({ sessionId: id });

    // Remove session
    this.sessions.delete(id);
    this.logger.log(`Deleted session: ${id}`);
  }

  // Internal method to update session stats
  async updateMessageCount(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      const count = await this.conversationRepository.count({
        where: { sessionId },
      });
      session.messageCount = count;
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  async updateTaskCount(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      const count = await this.taskRepository.count({
        where: { sessionId },
      });
      session.taskCount = count;
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }
}