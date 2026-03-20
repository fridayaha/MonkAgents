import { AgentRole } from './agent';

/**
 * Task status types
 */
export type TaskStatus =
  | 'pending'    // Waiting to be processed
  | 'thinking'   // Agent is analyzing
  | 'waiting'    // Waiting for user input or other agent
  | 'executing'  // Agent is executing
  | 'paused'     // Task paused by user
  | 'completed'  // Task finished successfully
  | 'failed';    // Task failed

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Subtask definition
 */
export interface Subtask {
  id: string;
  taskId: string;
  parentId?: string;
  agentId: string;
  agentRole: AgentRole;
  description: string;
  status: TaskStatus;
  order: number;
  result?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Main task definition
 */
export interface Task {
  id: string;
  sessionId: string;
  userPrompt: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgents: string[];
  subtasks: Subtask[];
  result?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Task creation input
 */
export interface CreateTaskInput {
  sessionId: string;
  userPrompt: string;
  priority?: TaskPriority;
}

/**
 * Task update input
 */
export interface UpdateTaskInput {
  status?: TaskStatus;
  result?: string;
  error?: string;
  assignedAgents?: string[];
}