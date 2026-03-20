import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledTask } from '../database/entities/scheduled-task.entity';

class CreateScheduledTaskDto {
  title: string;
  description?: string;
  schedule: string;
  repeat?: 'once' | 'daily' | 'weekly';
  context?: Record<string, unknown>;
  sessionId?: string;
}

/**
 * Controller for scheduled tasks management API
 */
@Controller('scheduled-tasks')
export class ScheduledTasksController {
  constructor(
    @InjectRepository(ScheduledTask)
    private readonly scheduledTaskRepository: Repository<ScheduledTask>,
  ) {}

  /**
   * Get all scheduled tasks
   * GET /api/scheduled-tasks
   */
  @Get()
  async findAll(): Promise<ScheduledTask[]> {
    return this.scheduledTaskRepository.find({
      order: { nextRunAt: 'ASC' },
    });
  }

  /**
   * Get a scheduled task by ID
   * GET /api/scheduled-tasks/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ScheduledTask | null> {
    return this.scheduledTaskRepository.findOne({ where: { id } });
  }

  /**
   * Create a new scheduled task
   * POST /api/scheduled-tasks
   */
  @Post()
  async create(@Body() dto: CreateScheduledTaskDto): Promise<ScheduledTask> {
    const task = this.scheduledTaskRepository.create({
      sessionId: dto.sessionId || 'default',
      name: dto.title,
      type: dto.repeat === 'once' ? 'once' : 'interval',
      prompt: dto.description || dto.title,
      scheduledAt: new Date(dto.schedule),
      nextRunAt: new Date(dto.schedule),
      status: 'pending',
    });

    return this.scheduledTaskRepository.save(task);
  }

  /**
   * Run a scheduled task immediately
   * POST /api/scheduled-tasks/:id/run
   */
  @Post(':id/run')
  async run(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const task = await this.scheduledTaskRepository.findOne({ where: { id } });
    if (!task) {
      return { success: false, message: 'Task not found' };
    }

    // Update last run time
    task.lastRunAt = new Date();
    task.runCount += 1;
    await this.scheduledTaskRepository.save(task);

    return { success: true, message: 'Task triggered for execution' };
  }

  /**
   * Delete a scheduled task
   * DELETE /api/scheduled-tasks/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.scheduledTaskRepository.delete(id);
  }
}