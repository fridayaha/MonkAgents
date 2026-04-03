/**
 * Heartbeat Interface
 * Defines types for agent heartbeat monitoring
 */

/**
 * Agent heartbeat status
 */
export type HeartbeatStatus = 'idle' | 'working' | 'error' | 'offline';

/**
 * Agent heartbeat data
 */
export interface AgentHeartbeat {
  /** Agent ID */
  agentId: string;

  /** Team ID this agent belongs to */
  teamId: string;

  /** Current status */
  status: HeartbeatStatus;

  /** Currently executing task ID */
  currentTaskId?: string;

  /** Heartbeat timestamp */
  timestamp: Date;

  /** Additional metadata */
  metadata?: HeartbeatMetadata;
}

/**
 * Heartbeat metadata
 */
export interface HeartbeatMetadata {
  /** Last activity timestamp */
  lastActivity?: Date;

  /** Number of completed tasks */
  tasksCompleted?: number;

  /** Number of consecutive errors */
  errorCount?: number;

  /** Current memory usage (MB) */
  memoryUsage?: number;

  /** Current CPU usage (%) */
  cpuUsage?: number;
}

/**
 * Heartbeat configuration
 */
export interface HeartbeatConfig {
  /** Heartbeat interval in milliseconds */
  intervalMs: number;

  /** Timeout threshold in milliseconds */
  timeoutMs: number;

  /** Check interval for timeout detection */
  checkIntervalMs: number;
}

/**
 * Heartbeat event for WebSocket broadcast
 */
export interface HeartbeatEvent {
  type: 'heartbeat';
  teamId: string;
  agentId: string;
  status: HeartbeatStatus;
  timestamp: Date;
}

/**
 * Agent timeout event
 */
export interface AgentTimeoutEvent {
  type: 'agent_timeout';
  teamId: string;
  agentId: string;
  lastHeartbeat: Date;
  currentTaskId?: string;
  timestamp: Date;
}

/**
 * Default heartbeat configuration
 */
export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 5000,      // 5 seconds
  timeoutMs: 30000,      // 30 seconds
  checkIntervalMs: 10000, // 10 seconds
};