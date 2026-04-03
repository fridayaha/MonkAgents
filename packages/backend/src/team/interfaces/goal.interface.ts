/**
 * Goal Interface
 * Defines types for goal hierarchy and progress tracking
 */

/**
 * Goal status
 */
export type GoalStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Goal priority
 */
export type GoalPriority = 'high' | 'medium' | 'low';

/**
 * Goal level in hierarchy
 */
export type GoalLevel = 'session' | 'task' | 'subtask';

/**
 * Goal definition
 */
export interface Goal {
  /** Unique goal ID */
  id: string;

  /** Team ID this goal belongs to */
  teamId: string;

  /** Parent goal ID (for subtask hierarchy) */
  parentId?: string;

  /** Level in goal hierarchy */
  level: GoalLevel;

  /** Short title */
  title: string;

  /** Detailed description */
  description: string;

  /** Current status */
  status: GoalStatus;

  /** Goal priority */
  priority: GoalPriority;

  /** Progress percentage (0-100) */
  progress: number;

  /** Agent assigned to this goal */
  assignedTo?: string;

  /** Child goal IDs */
  children: string[];

  /** Creation timestamp */
  createdAt: Date;

  /** Start timestamp */
  startedAt?: Date;

  /** Completion timestamp */
  completedAt?: Date;

  /** Estimated duration in seconds */
  estimatedDuration?: number;

  /** Actual duration in seconds */
  actualDuration?: number;

  /** Execution result */
  result?: GoalResult;

  /** Additional metadata */
  metadata?: GoalMetadata;
}

/**
 * Goal execution result
 */
export interface GoalResult {
  /** Result status */
  status: 'completed' | 'partial' | 'failed';

  /** Result summary */
  summary: string;

  /** Output items */
  outputs?: GoalOutput[];

  /** File changes */
  filesChanged?: GoalFileChange[];

  /** Execution metrics */
  metrics?: GoalMetrics;
}

/**
 * Goal output item
 */
export interface GoalOutput {
  /** Output type */
  type: 'file' | 'command' | 'message' | 'artifact';

  /** Description */
  description: string;

  /** Output value */
  value?: string;

  /** Associated file path */
  filePath?: string;
}

/**
 * Goal file change record
 */
export interface GoalFileChange {
  /** File path */
  path: string;

  /** Change action */
  action: 'created' | 'modified' | 'deleted';

  /** Change summary */
  summary?: string;
}

/**
 * Goal execution metrics
 */
export interface GoalMetrics {
  /** Total tokens used */
  tokensUsed?: number;

  /** Cost in USD */
  costUsd?: number;

  /** Number of turns */
  turnsCount?: number;

  /** Number of tools used */
  toolsUsed?: number;
}

/**
 * Goal metadata
 */
export interface GoalMetadata {
  /** Tags for categorization */
  tags?: string[];

  /** Associated files */
  files?: string[];

  /** Dependency goal IDs */
  dependencies?: string[];

  /** Custom properties */
  custom?: Record<string, unknown>;
}

/**
 * Goal creation options
 */
export interface CreateGoalOptions {
  /** Team ID */
  teamId: string;

  /** Parent goal ID */
  parentId?: string;

  /** Goal level */
  level: GoalLevel;

  /** Goal title */
  title: string;

  /** Goal description */
  description: string;

  /** Goal priority */
  priority?: GoalPriority;

  /** Assigned agent */
  assignedTo?: string;

  /** Estimated duration */
  estimatedDuration?: number;

  /** Metadata */
  metadata?: GoalMetadata;
}

/**
 * Goal progress event for WebSocket broadcast
 */
export interface GoalProgressEvent {
  /** Event type */
  type: 'goal_progress';

  /** Team ID */
  teamId: string;

  /** Goal ID */
  goalId: string;

  /** New status */
  status: GoalStatus;

  /** Progress percentage */
  progress: number;

  /** Optional message */
  message?: string;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Goal summary for a team
 */
export interface GoalSummary {
  /** Total goals */
  total: number;

  /** Completed goals */
  completed: number;

  /** In progress goals */
  inProgress: number;

  /** Pending goals */
  pending: number;

  /** Failed goals */
  failed: number;

  /** Overall progress percentage */
  overallProgress: number;
}

/**
 * Goal progress update for WebSocket
 */
export interface GoalProgressUpdate {
  /** Event type */
  type: 'goal_update';

  /** Team ID */
  teamId: string;

  /** Goal summary */
  summary: GoalSummary;

  /** All goals (optional, for full sync) */
  goals?: Goal[];

  /** Event timestamp */
  timestamp: Date;
}