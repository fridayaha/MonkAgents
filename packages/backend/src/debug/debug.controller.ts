import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../database/entities/task.entity';
import { ExecutionLog } from '../database/entities/execution-log.entity';

interface DebugInfo {
  taskId: string;
  status: string;
  tokensUsed: number;
  apiCalls: number;
  duration: number;
  contextSize: number;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    output?: unknown;
    duration: number;
  }>;
  timeline: Array<{
    time: Date;
    event: string;
    details?: string;
  }>;
}

/**
 * Controller for debug and observability API
 */
@Controller('debug')
export class DebugController {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(ExecutionLog)
    private readonly logRepository: Repository<ExecutionLog>,
  ) {}

  /**
   * Get debug info for a task
   * GET /api/debug/:taskId
   */
  @Get(':taskId')
  async getDebugInfo(@Param('taskId') taskId: string): Promise<DebugInfo> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: ['subtasks'],
    });

    if (!task) {
      return {
        taskId,
        status: 'not_found',
        tokensUsed: 0,
        apiCalls: 0,
        duration: 0,
        contextSize: 0,
        toolCalls: [],
        timeline: [],
      };
    }

    // Get execution logs
    const logs = await this.logRepository.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });

    // Calculate metrics from logs (metadata may contain tokens)
    const tokensUsed = logs.reduce((sum, log) => {
      return sum + ((log.metadata?.tokensUsed as number) || 0);
    }, 0);

    const apiCalls = logs.filter(log =>
      log.message?.includes('API') || log.metadata?.type === 'api_call'
    ).length;

    // Calculate duration
    const duration = task.completedAt && task.createdAt
      ? task.completedAt.getTime() - task.createdAt.getTime()
      : 0;

    // Extract tool calls from logs
    const toolCalls = logs
      .filter(log => log.metadata?.type === 'tool_call' || log.message?.includes('工具'))
      .map(log => ({
        name: (log.metadata?.toolName as string) || 'unknown',
        input: (log.metadata?.input as Record<string, unknown>) || {},
        output: log.metadata?.output,
        duration: (log.metadata?.duration as number) || 0,
      }));

    // Build timeline
    const timeline = logs.map(log => ({
      time: log.createdAt,
      event: log.level,
      details: log.message,
    }));

    return {
      taskId,
      status: task.status,
      tokensUsed,
      apiCalls,
      duration,
      contextSize: logs.length,
      toolCalls,
      timeline,
    };
  }

  /**
   * Get execution logs for a task
   * GET /api/debug/:taskId/logs
   */
  @Get(':taskId/logs')
  async getLogs(@Param('taskId') taskId: string): Promise<ExecutionLog[]> {
    return this.logRepository.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get metrics summary
   * GET /api/debug/metrics/summary
   */
  @Get('metrics/summary')
  async getMetricsSummary(): Promise<{
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalTokensUsed: number;
    totalApiCalls: number;
  }> {
    const totalTasks = await this.taskRepository.count();
    const completedTasks = await this.taskRepository.count({
      where: { status: 'completed' },
    });
    const failedTasks = await this.taskRepository.count({
      where: { status: 'failed' },
    });

    // Get all logs and sum tokens from metadata
    const logs = await this.logRepository.find();
    const totalTokensUsed = logs.reduce((sum, log) => {
      return sum + ((log.metadata?.tokensUsed as number) || 0);
    }, 0);

    const totalApiCalls = logs.filter(log =>
      log.message?.includes('API') || log.metadata?.type === 'api_call'
    ).length;

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      totalTokensUsed,
      totalApiCalls,
    };
  }
}