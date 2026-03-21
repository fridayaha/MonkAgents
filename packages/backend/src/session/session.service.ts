import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Session } from '../database/entities/session.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Task } from '../database/entities/task.entity';
import { SessionStatus, CreateSessionInput, SessionSummary, SessionDetail } from '@monkagents/shared';

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
}