/**
 * Team task status
 */
export type TeamTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Team task priority (simplified for team tasks)
 */
export type TeamTaskPriority = 'high' | 'medium' | 'low';

/**
 * Team task definition
 */
export interface TeamTask {
  /** Unique task ID */
  id: string;
  /** Team ID this task belongs to */
  teamId: string;
  /** Short title/subject */
  subject: string;
  /** Detailed description */
  description: string;
  /** Current status */
  status: TeamTaskStatus;
  /** Agent that claimed this task */
  owner?: string;
  /** Tasks that must complete before this one */
  blockedBy: string[];
  /** Tasks that depend on this one */
  blocks: string[];
  /** Task priority */
  priority: TeamTaskPriority;
  /** Specific agent assignment (optional) */
  assignedTo?: string;
  /** Execution result summary */
  result?: TeamTaskResult;
  /** Creation timestamp */
  createdAt: Date;
  /** Claim timestamp */
  claimedAt?: Date;
  /** Completion timestamp */
  completedAt?: Date;
}

/**
 * Simplified execution result for team task
 */
export interface TeamTaskResult {
  status: 'completed' | 'partial' | 'failed';
  filesChanged?: TeamFileChange[];
  outputs?: TeamOutput[];
  error?: string;
}

export interface TeamFileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  summary?: string;
}

export interface TeamOutput {
  type: string;
  description: string;
  value?: string;
  filePath?: string;
}

/**
 * Task creation options
 */
export interface CreateTaskOptions {
  teamId: string;
  subject: string;
  description: string;
  priority?: TeamTaskPriority;
  assignedTo?: string;
  blockedBy?: string[];
}

/**
 * Task claim result
 */
export interface TaskClaimResult {
  success: boolean;
  task?: TeamTask;
  reason?: string;
}

/**
 * Task update event
 */
export interface TaskUpdateEvent {
  teamId: string;
  taskId: string;
  status: TeamTaskStatus;
  owner?: string;
  timestamp: Date;
}