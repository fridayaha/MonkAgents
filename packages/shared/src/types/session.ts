/**
 * Session status
 */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

/**
 * Session configuration
 */
export interface SessionConfig {
  workingDirectory: string;
  primaryAgent?: string;
  maxAgents?: number;
  timeout?: number;
}

/**
 * Session definition
 */
export interface Session {
  id: string;
  title?: string;
  status: SessionStatus;
  config: SessionConfig;
  workingDirectory: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  taskCount: number;
}

/**
 * Session creation input
 */
export interface CreateSessionInput {
  title?: string;
  workingDirectory: string;
  primaryAgent?: string;
}

/**
 * Session summary for list view
 */
export interface SessionSummary {
  id: string;
  title?: string;
  status: SessionStatus;
  workingDirectory: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  taskCount: number;
}

/**
 * Session detail with messages
 */
export interface SessionDetail extends Session {
  messages: import('./message').Message[];
  tasks: import('./task').Task[];
}