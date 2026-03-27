/**
 * Mailbox message types
 */
export type MailboxMessageType = 'task_update' | 'handoff' | 'query' | 'notification' | 'broadcast';

/**
 * Mailbox message for inter-agent communication
 */
export interface MailboxMessage {
  /** Unique message ID */
  id: string;
  /** Team ID */
  teamId: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID or 'broadcast' for all */
  to: string | 'broadcast';
  /** Message type */
  type: MailboxMessageType;
  /** Message payload */
  payload: MailboxPayload;
  /** Message timestamp */
  timestamp: Date;
}

/**
 * Message payload types
 */
export type MailboxPayload =
  | TaskUpdatePayload
  | HandoffPayload
  | QueryPayload
  | NotificationPayload;

/**
 * Task update notification
 */
export interface TaskUpdatePayload {
  taskId: string;
  status: 'started' | 'completed' | 'failed';
  result?: TeamTaskResult;
}

/**
 * Handoff request payload
 */
export interface HandoffPayload {
  taskId: string;
  targetAgent: string;
  task: string;
  reason: string;
  context?: TeamTaskResult;
}

/**
 * Query payload for asking other agents
 */
export interface QueryPayload {
  queryId: string;
  question: string;
  context?: string;
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

/**
 * Team task result (imported from task interface)
 */
import { TeamTaskResult } from './task.interface';