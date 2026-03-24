import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../database/entities/task.entity';
import { Subtask } from '../database/entities/subtask.entity';
import { CreateTaskDto, UpdateTaskDto, CreateSubtaskDto, UpdateSubtaskDto } from './dto/tasks.dto';
import { TaskStatus, Task as ITask, Subtask as ISubtask } from '@monkagents/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing tasks and subtasks
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Subtask)
    private readonly subtaskRepository: Repository<Subtask>,
  ) {}

  /**
   * Create a new task
   */
  async create(dto: CreateTaskDto): Promise<Task> {
    this.logger.log(`Creating task for session: ${dto.sessionId}`);

    const task = this.taskRepository.create({
      id: uuidv4(),
      sessionId: dto.sessionId,
      userPrompt: dto.userPrompt,
      status: 'pending',
      priority: dto.priority || 'normal',
      assignedAgents: [],
      subtasks: [],
    });

    return this.taskRepository.save(task);
  }

  /**
   * Get all tasks, optionally filtered by session or status
   */
  async findAll(sessionId?: string, status?: TaskStatus): Promise<Task[]> {
    const query = this.taskRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.subtasks', 'subtask')
      .orderBy('task.createdAt', 'DESC');

    if (sessionId) {
      query.andWhere('task.sessionId = :sessionId', { sessionId });
    }

    if (status) {
      query.andWhere('task.status = :status', { status });
    }

    return query.getMany();
  }

  /**
   * Get a single task by ID
   */
  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['subtasks'],
    });

    if (!task) {
      throw new NotFoundException(`Task not found: ${id}`);
    }

    return task;
  }

  /**
   * Update a task
   */
  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);

    // Update fields
    if (dto.status !== undefined) {
      task.status = dto.status;

      // Update timestamps based on status
      if (dto.status === 'executing' && !task.startedAt) {
        task.startedAt = new Date();
      }
      if (['completed', 'failed'].includes(dto.status)) {
        task.completedAt = new Date();
      }
    }

    if (dto.result !== undefined) {
      task.result = dto.result;
    }

    if (dto.error !== undefined) {
      task.error = dto.error;
    }

    if (dto.assignedAgents !== undefined) {
      task.assignedAgents = dto.assignedAgents;
    }

    return this.taskRepository.save(task);
  }

  /**
   * Delete a task
   */
  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.taskRepository.remove(task);
    this.logger.log(`Task deleted: ${id}`);
  }

  /**
   * Retry a failed task
   */
  async retry(id: string): Promise<Task> {
    const task = await this.findOne(id);

    if (task.status !== 'failed') {
      throw new Error('Only failed tasks can be retried');
    }

    task.status = 'pending';
    task.error = null as any;
    task.completedAt = null as any;

    return this.taskRepository.save(task);
  }

  /**
   * Cancel a task
   */
  async cancel(id: string): Promise<Task> {
    const task = await this.findOne(id);

    if (!['pending', 'thinking', 'waiting', 'executing'].includes(task.status)) {
      throw new Error(`Cannot cancel task with status: ${task.status}`);
    }

    task.status = 'failed';
    task.error = 'Cancelled by user';
    task.completedAt = new Date();

    return this.taskRepository.save(task);
  }

  // Subtask methods

  /**
   * Create a subtask
   */
  async createSubtask(dto: CreateSubtaskDto): Promise<Subtask> {
    // Verify parent task exists
    const task = await this.findOne(dto.taskId);

    // Get max order for this task
    const maxOrder = await this.subtaskRepository
      .createQueryBuilder('subtask')
      .where('subtask.taskId = :taskId', { taskId: dto.taskId })
      .select('MAX(subtask.order)', 'max')
      .getRawOne();

    const order = dto.order ?? ((maxOrder?.max ?? -1) + 1);

    const subtask = this.subtaskRepository.create({
      id: uuidv4(),
      taskId: dto.taskId,
      parentId: dto.parentId,
      agentId: dto.agentId,
      agentRole: dto.agentRole as any,
      description: dto.description,
      status: 'pending',
      order,
    });

    const saved = await this.subtaskRepository.save(subtask);

    // Update task's assigned agents
    if (!task.assignedAgents.includes(dto.agentId)) {
      task.assignedAgents = [...task.assignedAgents, dto.agentId];
      await this.taskRepository.save(task);
    }

    return saved;
  }

  /**
   * Update a subtask
   */
  async updateSubtask(id: string, dto: UpdateSubtaskDto): Promise<Subtask> {
    const subtask = await this.subtaskRepository.findOne({
      where: { id },
    });

    if (!subtask) {
      throw new NotFoundException(`Subtask not found: ${id}`);
    }

    if (dto.status !== undefined) {
      subtask.status = dto.status;

      if (dto.status === 'executing' && !subtask.startedAt) {
        subtask.startedAt = new Date();
      }
      if (['completed', 'failed'].includes(dto.status)) {
        subtask.completedAt = new Date();
      }
    }

    if (dto.result !== undefined) {
      subtask.result = dto.result;
    }

    if (dto.executionSummary !== undefined) {
      subtask.executionSummary = dto.executionSummary;
    }

    if (dto.handoffCount !== undefined) {
      subtask.handoffCount = dto.handoffCount;
    }

    return this.subtaskRepository.save(subtask);
  }

  /**
   * Get subtasks for a task
   */
  async getSubtasks(taskId: string): Promise<Subtask[]> {
    return this.subtaskRepository.find({
      where: { taskId },
      order: { order: 'ASC' },
    });
  }

  /**
   * Delete a subtask
   */
  async removeSubtask(id: string): Promise<void> {
    const subtask = await this.subtaskRepository.findOne({
      where: { id },
    });

    if (!subtask) {
      throw new NotFoundException(`Subtask not found: ${id}`);
    }

    await this.subtaskRepository.remove(subtask);
  }

  /**
   * Convert Task entity to interface
   */
  toInterface(task: Task): ITask {
    return {
      id: task.id,
      sessionId: task.sessionId,
      userPrompt: task.userPrompt,
      status: task.status,
      priority: task.priority,
      assignedAgents: task.assignedAgents || [],
      subtasks: (task.subtasks || []).map(this.subtaskToInterface),
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  }

  /**
   * Convert Subtask entity to interface
   */
  private subtaskToInterface(subtask: Subtask): ISubtask {
    return {
      id: subtask.id,
      taskId: subtask.taskId,
      parentId: subtask.parentId,
      agentId: subtask.agentId,
      agentRole: subtask.agentRole,
      description: subtask.description,
      status: subtask.status,
      order: subtask.order,
      result: subtask.result,
      createdAt: subtask.createdAt,
      startedAt: subtask.startedAt,
      completedAt: subtask.completedAt,
    };
  }
}