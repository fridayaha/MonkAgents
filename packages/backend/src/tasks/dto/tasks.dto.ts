import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { TaskPriority, TaskStatus } from '@monkagents/shared';

/**
 * DTO for creating a new task
 */
export class CreateTaskDto {
  @IsString()
  sessionId: string;

  @IsString()
  userPrompt: string;

  @IsOptional()
  @IsEnum(['low', 'normal', 'high', 'urgent'])
  priority?: TaskPriority;
}

/**
 * DTO for updating a task
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsEnum(['pending', 'thinking', 'waiting', 'executing', 'paused', 'completed', 'failed'])
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedAgents?: string[];
}

/**
 * DTO for creating a subtask
 */
export class CreateSubtaskDto {
  @IsString()
  taskId: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  agentId: string;

  @IsString()
  agentRole: string;

  @IsString()
  description: string;

  @IsOptional()
  order?: number;
}

/**
 * DTO for updating a subtask
 */
export class UpdateSubtaskDto {
  @IsOptional()
  @IsEnum(['pending', 'thinking', 'waiting', 'executing', 'paused', 'completed', 'failed'])
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  result?: string;
}