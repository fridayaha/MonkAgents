import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, CreateSubtaskDto, UpdateSubtaskDto } from './dto/tasks.dto';
import { Task } from '../database/entities/task.entity';
import { Subtask } from '../database/entities/subtask.entity';

/**
 * Controller for task management API
 */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * Create a new task
   * POST /api/tasks
   */
  @Post()
  async create(@Body() dto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(dto);
  }

  /**
   * Get all tasks
   * GET /api/tasks?sessionId=&status=
   */
  @Get()
  async findAll(
    @Query('sessionId') sessionId?: string,
    @Query('status') status?: string,
  ): Promise<Task[]> {
    return this.tasksService.findAll(sessionId, status as any);
  }

  /**
   * Get a task by ID
   * GET /api/tasks/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Task> {
    return this.tasksService.findOne(id);
  }

  /**
   * Update a task
   * POST /api/tasks/:id
   */
  @Post(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto): Promise<Task> {
    return this.tasksService.update(id, dto);
  }

  /**
   * Delete a task
   * DELETE /api/tasks/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.tasksService.remove(id);
  }

  /**
   * Retry a failed task
   * POST /api/tasks/:id/retry
   */
  @Post(':id/retry')
  async retry(@Param('id') id: string): Promise<Task> {
    return this.tasksService.retry(id);
  }

  /**
   * Cancel a task
   * POST /api/tasks/:id/cancel
   */
  @Post(':id/cancel')
  async cancel(@Param('id') id: string): Promise<Task> {
    return this.tasksService.cancel(id);
  }

  // Subtask endpoints

  /**
   * Create a subtask
   * POST /api/tasks/subtasks
   */
  @Post('subtasks')
  async createSubtask(@Body() dto: CreateSubtaskDto): Promise<Subtask> {
    return this.tasksService.createSubtask(dto);
  }

  /**
   * Get subtasks for a task
   * GET /api/tasks/:id/subtasks
   */
  @Get(':id/subtasks')
  async getSubtasks(@Param('id') id: string): Promise<Subtask[]> {
    return this.tasksService.getSubtasks(id);
  }

  /**
   * Update a subtask
   * POST /api/tasks/subtasks/:id
   */
  @Post('subtasks/:id')
  async updateSubtask(
    @Param('id') id: string,
    @Body() dto: UpdateSubtaskDto,
  ): Promise<Subtask> {
    return this.tasksService.updateSubtask(id, dto);
  }

  /**
   * Delete a subtask
   * DELETE /api/tasks/subtasks/:id
   */
  @Delete('subtasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSubtask(@Param('id') id: string): Promise<void> {
    return this.tasksService.removeSubtask(id);
  }
}