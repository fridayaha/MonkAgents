/**
 * Team types for multi-agent parallel execution
 */

export {
  Team,
  TeamStatus,
  TeamMember,
  TeamMemberStatus,
  CreateTeamOptions,
  TeamStatusEvent,
} from './team/team.interface';

export {
  TeamTask,
  TeamTaskStatus,
  TeamTaskPriority,
  TeamTaskResult,
  TeamFileChange,
  TeamOutput,
  CreateTaskOptions,
  TaskClaimResult,
  TaskUpdateEvent,
} from './team/task.interface';

export {
  MailboxMessage,
  MailboxMessageType,
  MailboxPayload,
  TaskUpdatePayload,
  HandoffPayload,
  QueryPayload,
  NotificationPayload,
} from './team/mailbox.interface';