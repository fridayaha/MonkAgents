import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  TeamTask,
  TeamTaskStatus,
  TeamTaskPriority,
  TeamTaskResult,
  CreateTaskOptions,
  TaskClaimResult,
} from './interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lock acquisition options
 */
interface LockOptions {
  lockTtlMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Default lock options
 */
const DEFAULT_LOCK_OPTIONS: Required<LockOptions> = {
  lockTtlMs: 30000, // 30 seconds
  maxRetries: 10,
  retryDelayMs: 100,
};

/**
 * Task List Service
 * Manages shared task list with Redis-based distributed locking
 */
@Injectable()
export class TaskListService {
  private readonly logger = new Logger(TaskListService.name);

  /** Redis service for persistence and locking */
  private redisService: RedisService | null = null;

  /** In-memory task cache (for quick access) */
  private tasks: Map<string, TeamTask> = new Map();

  /** Tasks by team ID */
  private tasksByTeam: Map<string, Set<string>> = new Map();

  constructor() {}

  /**
   * Set Redis service (dependency injection)
   */
  setRedisService(redisService: RedisService): void {
    this.redisService = redisService;
  }

  /**
   * Create a new task
   */
  async createTask(options: CreateTaskOptions): Promise<TeamTask> {
    const taskId = uuidv4();

    const task: TeamTask = {
      id: taskId,
      teamId: options.teamId,
      subject: options.subject,
      description: options.description,
      status: 'pending',
      blockedBy: options.blockedBy || [],
      blocks: [],
      priority: options.priority || 'medium',
      assignedTo: options.assignedTo,
      createdAt: new Date(),
    };

    // Store in memory
    this.tasks.set(taskId, task);

    // Add to team index
    let teamTasks = this.tasksByTeam.get(options.teamId);
    if (!teamTasks) {
      teamTasks = new Set();
      this.tasksByTeam.set(options.teamId, teamTasks);
    }
    teamTasks.add(taskId);

    // Persist to Redis
    await this.persistTask(task);

    // Update dependency graph
    await this.updateDependencyGraph(task);

    this.logger.debug(`Created task ${taskId}: ${options.subject}`);

    return task;
  }

  /**
   * Create multiple tasks in batch
   */
  async createTasks(tasks: CreateTaskOptions[]): Promise<TeamTask[]> {
    const results: TeamTask[] = [];
    for (const options of tasks) {
      results.push(await this.createTask(options));
    }
    return results;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): TeamTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks for a team
   */
  getTeamTasks(teamId: string): TeamTask[] {
    const taskIds = this.tasksByTeam.get(teamId);
    if (!taskIds) return [];

    return Array.from(taskIds)
      .map(id => this.tasks.get(id))
      .filter((t): t is TeamTask => t !== undefined);
  }

  /**
   * Claim a task with distributed lock
   * Only one agent can claim a task at a time
   */
  async claimTask(
    teamId: string,
    agentId: string,
    options?: LockOptions,
  ): Promise<TaskClaimResult> {
    const lockOptions = { ...DEFAULT_LOCK_OPTIONS, ...options };

    // Find available tasks for this agent
    const availableTasks = this.findAvailableTasks(teamId, agentId);

    if (availableTasks.length === 0) {
      return {
        success: false,
        reason: 'No available tasks',
      };
    }

    // Try to claim tasks in priority order
    for (const task of availableTasks) {
      const lockKey = `task_lock:${task.id}`;
      const acquired = await this.acquireLock(
        lockKey,
        agentId,
        lockOptions.lockTtlMs,
        lockOptions.maxRetries,
        lockOptions.retryDelayMs,
      );

      if (acquired) {
        // Update task status
        task.status = 'in_progress';
        task.owner = agentId;
        task.claimedAt = new Date();

        // Persist changes
        await this.persistTask(task);

        this.logger.log(`Agent ${agentId} claimed task ${task.id}: ${task.subject}`);

        return {
          success: true,
          task,
        };
      }
    }

    return {
      success: false,
      reason: 'Could not acquire lock on any available task',
    };
  }

  /**
   * Complete a task and release its lock
   */
  async completeTask(
    taskId: string,
    result?: TeamTaskResult,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return;
    }

    task.status = result?.status === 'failed' ? 'failed' : 'completed';
    task.result = result;
    task.completedAt = new Date();

    // Persist changes
    await this.persistTask(task);

    // Release the lock
    await this.releaseLock(`task_lock:${taskId}`);

    // Unblock dependent tasks
    await this.unblockDependentTasks(taskId);

    this.logger.log(`Task ${taskId} completed with status: ${task.status}`);
  }

  /**
   * Fail a task
   */
  async failTask(taskId: string, error?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.completedAt = new Date();

    if (error) {
      task.result = {
        status: 'failed',
        outputs: [{ type: 'error', description: error }],
      };
    }

    await this.persistTask(task);
    await this.releaseLock(`task_lock:${taskId}`);

    this.logger.warn(`Task ${taskId} failed: ${error || 'Unknown error'}`);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'cancelled';
    task.completedAt = new Date();

    await this.persistTask(task);
    await this.releaseLock(`task_lock:${taskId}`);

    this.logger.log(`Task ${taskId} cancelled`);
  }

  /**
   * Clear all tasks for a team
   */
  async clearTeamTasks(teamId: string): Promise<void> {
    const taskIds = this.tasksByTeam.get(teamId);
    if (!taskIds) return;

    for (const taskId of taskIds) {
      await this.releaseLock(`task_lock:${taskId}`);
      this.tasks.delete(taskId);
    }

    this.tasksByTeam.delete(teamId);

    if (this.redisService?.isAvailable()) {
      // Clear from Redis
      const keys = Array.from(taskIds).map(id => `task:${id}`);
      for (const key of keys) {
        await this.redisService.del(key);
      }
    }

    this.logger.log(`Cleared ${taskIds.size} tasks for team ${teamId}`);
  }

  /**
   * Find available tasks for an agent
   * Tasks are sorted by priority and then by creation time
   */
  private findAvailableTasks(teamId: string, agentId: string): TeamTask[] {
    const tasks = this.getTeamTasks(teamId);

    return tasks
      .filter(task => {
        // Must be pending
        if (task.status !== 'pending') return false;

        // If assigned to specific agent, must match
        if (task.assignedTo && task.assignedTo !== agentId) return false;

        // Must not be blocked
        if (task.blockedBy.length > 0) {
          const allDependenciesCompleted = task.blockedBy.every(depId => {
            const dep = this.tasks.get(depId);
            return dep && dep.status === 'completed';
          });
          if (!allDependenciesCompleted) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder: Record<TeamTaskPriority, number> = {
          high: 0,
          medium: 1,
          low: 2,
        };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        // Then by creation time
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * Acquire distributed lock
   */
  private async acquireLock(
    key: string,
    owner: string,
    ttlMs: number,
    maxRetries: number,
    retryDelayMs: number,
  ): Promise<boolean> {
    if (!this.redisService?.isAvailable()) {
      // If Redis not available, use in-memory lock
      return this.acquireMemoryLock(key, owner, ttlMs);
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Use Redis SET with NX for atomic lock acquisition
        const client = (this.redisService as any)?.client;
        if (!client) {
          // Fallback to in-memory lock
          return this.acquireMemoryLock(key, owner, ttlMs);
        }

        const result = await client.set(
          key,
          owner,
          'PX',
          ttlMs,
          'NX',
        );

        if (result === 'OK') {
          return true;
        }

        // Wait before retry
        await this.sleep(retryDelayMs);
      } catch (error) {
        this.logger.error(`Lock acquisition error: ${error}`);
        await this.sleep(retryDelayMs);
      }
    }

    return false;
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(key: string): Promise<void> {
    if (!this.redisService?.isAvailable()) {
      this.memoryLocks.delete(key);
      return;
    }

    try {
      await this.redisService.del(key);
    } catch (error) {
      this.logger.error(`Lock release error: ${error}`);
    }
  }

  /** In-memory locks for fallback */
  private memoryLocks: Map<string, { owner: string; expiresAt: number }> = new Map();

  /**
   * Acquire in-memory lock (fallback when Redis unavailable)
   */
  private acquireMemoryLock(key: string, owner: string, ttlMs: number): boolean {
    const existing = this.memoryLocks.get(key);

    if (existing) {
      // Check if expired
      if (Date.now() < existing.expiresAt) {
        return false;
      }
    }

    this.memoryLocks.set(key, {
      owner,
      expiresAt: Date.now() + ttlMs,
    });

    return true;
  }

  /**
   * Get Redis client (for lock operations)
   */
  getClient(): any {
    return (this.redisService as any)?.client;
  }

  /**
   * Persist task to Redis
   */
  private async persistTask(task: TeamTask): Promise<void> {
    if (!this.redisService?.isAvailable()) return;

    try {
      const key = `task:${task.id}`;
      await this.redisService.set(key, JSON.stringify(task));
    } catch (error) {
      this.logger.error(`Failed to persist task: ${error}`);
    }
  }

  /**
   * Update dependency graph when creating a task
   */
  private async updateDependencyGraph(task: TeamTask): Promise<void> {
    for (const blockedById of task.blockedBy) {
      const blockerTask = this.tasks.get(blockedById);
      if (blockerTask) {
        blockerTask.blocks.push(task.id);
      }
    }
  }

  /**
   * Unblock tasks that were waiting on a completed task
   */
  private async unblockDependentTasks(completedTaskId: string): Promise<void> {
    const task = this.tasks.get(completedTaskId);
    if (!task) return;

    for (const dependentId of task.blocks) {
      const dependent = this.tasks.get(dependentId);
      if (!dependent) continue;

      // Check if all dependencies are now completed
      const allCompleted = dependent.blockedBy.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (allCompleted) {
        this.logger.debug(`Task ${dependentId} is now unblocked`);
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get tasks count by status for a team
   */
  getTaskCounts(teamId: string): Record<TeamTaskStatus, number> {
    const tasks = this.getTeamTasks(teamId);
    const counts: Record<TeamTaskStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const task of tasks) {
      counts[task.status]++;
    }

    return counts;
  }

  /**
   * Check if all tasks for a team are completed
   */
  isTeamComplete(teamId: string): boolean {
    const counts = this.getTaskCounts(teamId);
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
    return total > 0 && (counts.completed + counts.failed + counts.cancelled) === total;
  }
}