import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  Goal,
  GoalStatus,
  GoalResult,
  GoalSummary,
  CreateGoalOptions,
  GoalProgressEvent,
  GoalProgressUpdate,
} from './interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * GoalService
 * Manages goal hierarchy and progress tracking
 */
@Injectable()
export class GoalService {
  private readonly logger = new Logger(GoalService.name);

  /** Redis service for persistence */
  private redisService: RedisService | null = null;

  /** WebSocket service for broadcasting */
  private wsService: any = null;

  /** Goal storage: goalId -> Goal */
  private goals: Map<string, Goal> = new Map();

  /** Goals by team: teamId -> Set<goalId> */
  private goalsByTeam: Map<string, Set<string>> = new Map();

  /** Goals by parent: parentId -> Set<goalId> */
  private goalsByParent: Map<string, Set<string>> = new Map();

  constructor() {}

  /**
   * Set Redis service
   */
  setRedisService(redisService: RedisService): void {
    this.redisService = redisService;
  }

  /**
   * Set WebSocket service for broadcasting
   */
  setWebSocketService(wsService: any): void {
    this.wsService = wsService;
  }

  /**
   * Create a session-level goal with task goals
   */
  async createSessionGoal(
    teamId: string,
    userPrompt: string,
    tasks: CreateGoalOptions[],
  ): Promise<Goal> {
    // Create session goal
    const sessionGoal = await this.createGoal({
      teamId,
      level: 'session',
      title: this.truncateTitle(userPrompt, 50),
      description: userPrompt,
      priority: 'high',
    });

    // Create task goals
    for (const taskOpt of tasks) {
      const taskGoal = await this.createGoal({
        ...taskOpt,
        teamId,
        parentId: sessionGoal.id,
        level: 'task',
      });

      // Update parent's children list
      sessionGoal.children.push(taskGoal.id);
    }

    // Persist updated session goal
    await this.persistGoal(sessionGoal);

    this.logger.log(
      `Created session goal ${sessionGoal.id} with ${sessionGoal.children.length} tasks`
    );

    return sessionGoal;
  }

  /**
   * Create a goal
   */
  async createGoal(options: CreateGoalOptions): Promise<Goal> {
    const goal: Goal = {
      id: uuidv4(),
      teamId: options.teamId,
      parentId: options.parentId,
      level: options.level,
      title: options.title,
      description: options.description,
      status: 'pending',
      priority: options.priority || 'medium',
      progress: 0,
      children: [],
      createdAt: new Date(),
      assignedTo: options.assignedTo,
      estimatedDuration: options.estimatedDuration,
      metadata: options.metadata,
    };

    // Store in memory
    this.goals.set(goal.id, goal);

    // Add to team index
    let teamGoals = this.goalsByTeam.get(options.teamId);
    if (!teamGoals) {
      teamGoals = new Set();
      this.goalsByTeam.set(options.teamId, teamGoals);
    }
    teamGoals.add(goal.id);

    // Add to parent's children index
    if (options.parentId) {
      let siblingGoals = this.goalsByParent.get(options.parentId);
      if (!siblingGoals) {
        siblingGoals = new Set();
        this.goalsByParent.set(options.parentId, siblingGoals);
      }
      siblingGoals.add(goal.id);
    }

    // Persist to Redis
    await this.persistGoal(goal);

    this.logger.debug(`Created ${goal.level} goal: ${goal.id} - ${goal.title}`);

    return goal;
  }

  /**
   * Get goal by ID
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * Get all goals for a team
   */
  getTeamGoals(teamId: string): Goal[] {
    const goalIds = this.goalsByTeam.get(teamId);
    if (!goalIds) return [];

    return Array.from(goalIds)
      .map(id => this.goals.get(id))
      .filter((g): g is Goal => g !== undefined);
  }

  /**
   * Get child goals
   */
  getChildGoals(parentId: string): Goal[] {
    const childIds = this.goalsByParent.get(parentId);
    if (!childIds) return [];

    return Array.from(childIds)
      .map(id => this.goals.get(id))
      .filter((g): g is Goal => g !== undefined);
  }

  /**
   * Update goal progress
   */
  async updateProgress(
    goalId: string,
    progress: number,
    status?: GoalStatus,
  ): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    // Update progress (clamp to 0-100)
    goal.progress = Math.min(100, Math.max(0, progress));

    // Update status if provided
    if (status) {
      goal.status = status;

      // Update timestamps
      if (status === 'in_progress' && !goal.startedAt) {
        goal.startedAt = new Date();
      }
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        goal.completedAt = new Date();
        if (goal.startedAt) {
          goal.actualDuration = Math.round(
            (goal.completedAt.getTime() - goal.startedAt.getTime()) / 1000
          );
        }
        goal.progress = status === 'completed' ? 100 : goal.progress;
      }
    }

    // Persist changes
    await this.persistGoal(goal);

    // Broadcast progress event
    this.broadcastProgress(goal);

    // Update parent's progress
    if (goal.parentId) {
      await this.updateParentProgress(goal.parentId);
    }

    this.logger.debug(
      `Goal ${goalId} progress: ${goal.progress}%, status: ${goal.status}`
    );
  }

  /**
   * Update goal status
   */
  async updateStatus(goalId: string, status: GoalStatus): Promise<void> {
    await this.updateProgress(goalId, -1, status);
  }

  /**
   * Set goal result
   */
  async setGoalResult(goalId: string, result: GoalResult): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    goal.result = result;

    // Auto-update status based on result
    if (result.status === 'completed') {
      goal.status = 'completed';
      goal.progress = 100;
      goal.completedAt = new Date();
    } else if (result.status === 'failed') {
      goal.status = 'failed';
      goal.completedAt = new Date();
    } else if (result.status === 'partial') {
      // Keep current status or set to completed
      if (goal.status !== 'completed') {
        goal.status = 'completed';
        goal.completedAt = new Date();
      }
    }

    await this.persistGoal(goal);
    this.broadcastProgress(goal);

    if (goal.parentId) {
      await this.updateParentProgress(goal.parentId);
    }
  }

  /**
   * Calculate and update parent goal progress
   */
  private async updateParentProgress(parentId: string): Promise<void> {
    const parent = this.goals.get(parentId);
    if (!parent) return;

    const children = this.getChildGoals(parentId);
    if (children.length === 0) return;

    // Calculate average progress
    let totalProgress = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const child of children) {
      totalProgress += child.progress;
      if (child.status === 'completed') completedCount++;
      if (child.status === 'failed') failedCount++;
    }

    parent.progress = Math.round(totalProgress / children.length);

    // Update parent status
    if (completedCount + failedCount === children.length) {
      // All children finished
      if (failedCount === 0) {
        parent.status = 'completed';
      } else if (completedCount === 0) {
        parent.status = 'failed';
      } else {
        parent.status = 'completed'; // Partial success
      }
      parent.completedAt = new Date();

      if (parent.startedAt) {
        parent.actualDuration = Math.round(
          (parent.completedAt.getTime() - parent.startedAt.getTime()) / 1000
        );
      }
    } else if (completedCount > 0 || failedCount > 0) {
      // Some children finished
      parent.status = 'in_progress';
      if (!parent.startedAt) {
        parent.startedAt = new Date();
      }
    }

    await this.persistGoal(parent);
    this.broadcastProgress(parent);

    // Recursively update ancestors
    if (parent.parentId) {
      await this.updateParentProgress(parent.parentId);
    }
  }

  /**
   * Get goal summary for a team
   */
  getGoalSummary(teamId: string): GoalSummary {
    const goals = this.getTeamGoals(teamId);

    let completed = 0, inProgress = 0, pending = 0, failed = 0;
    let totalProgress = 0;

    for (const goal of goals) {
      switch (goal.status) {
        case 'completed': completed++; break;
        case 'in_progress': inProgress++; break;
        case 'pending': pending++; break;
        case 'failed': failed++; break;
      }
      totalProgress += goal.progress;
    }

    return {
      total: goals.length,
      completed,
      inProgress,
      pending,
      failed,
      overallProgress: goals.length > 0 ? Math.round(totalProgress / goals.length) : 0,
    };
  }

  /**
   * Get session goal for a team
   */
  getSessionGoal(teamId: string): Goal | undefined {
    const goals = this.getTeamGoals(teamId);
    return goals.find(g => g.level === 'session');
  }

  /**
   * Clear all goals for a team
   */
  async clearTeamGoals(teamId: string): Promise<void> {
    const goalIds = this.goalsByTeam.get(teamId);
    if (!goalIds) return;

    // Delete from memory
    for (const goalId of goalIds) {
      const goal = this.goals.get(goalId);
      if (goal?.parentId) {
        const siblings = this.goalsByParent.get(goal.parentId);
        if (siblings) {
          siblings.delete(goalId);
        }
      }
      this.goals.delete(goalId);
    }

    // Delete from Redis
    if (this.redisService?.isAvailable()) {
      for (const goalId of goalIds) {
        await this.redisService.del(`goal:${goalId}`);
      }
    }

    this.goalsByTeam.delete(teamId);
    this.logger.debug(`Cleared ${goalIds.size} goals for team ${teamId}`);
  }

  /**
   * Persist goal to Redis
   */
  private async persistGoal(goal: Goal): Promise<void> {
    if (!this.redisService?.isAvailable()) return;

    try {
      const key = `goal:${goal.id}`;
      await this.redisService.set(key, JSON.stringify(goal));
    } catch (error) {
      this.logger.error(`Failed to persist goal: ${error}`);
    }
  }

  /**
   * Broadcast goal progress event
   */
  private broadcastProgress(goal: Goal): void {
    if (!this.wsService) return;

    const event: GoalProgressEvent = {
      type: 'goal_progress',
      teamId: goal.teamId,
      goalId: goal.id,
      status: goal.status,
      progress: goal.progress,
      timestamp: new Date(),
    };

    this.wsService.emitToSession(goal.teamId, 'goal_progress', event);

    // Also broadcast full update
    const summary = this.getGoalSummary(goal.teamId);
    const update: GoalProgressUpdate = {
      type: 'goal_update',
      teamId: goal.teamId,
      summary,
      timestamp: new Date(),
    };

    this.wsService.emitToSession(goal.teamId, 'goal_update', update);
  }

  /**
   * Truncate title helper
   */
  private truncateTitle(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }
}