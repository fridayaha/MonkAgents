/**
 * Team status
 */
export type TeamStatus = 'active' | 'completed' | 'cancelled' | 'error';

/**
 * Team member status
 */
export type TeamMemberStatus = 'idle' | 'working' | 'offline';

/**
 * Team member information
 */
export interface TeamMember {
  /** Agent ID (e.g., 'wukong', 'shaseng') */
  agentId: string;
  /** Display name (e.g., '孙悟空') */
  agentName: string;
  /** Agent role */
  role: AgentRole;
  /** Current status */
  status: TeamMemberStatus;
  /** Currently executing task ID */
  currentTaskId?: string;
  /** Number of tasks completed */
  tasksCompleted: number;
}

/**
 * Agent role types
 */
export type AgentRole = 'master' | 'executor' | 'assistant' | 'inspector' | 'advisor';

/**
 * Team information
 */
export interface Team {
  /** Unique team ID */
  id: string;
  /** Associated session ID */
  sessionId: string;
  /** Team creation time */
  createdAt: Date;
  /** Team status */
  status: TeamStatus;
  /** Team members */
  members: TeamMember[];
  /** Original user prompt */
  userPrompt: string;
  /** Working directory for the team */
  workingDirectory: string;
}

/**
 * Team creation options
 */
export interface CreateTeamOptions {
  sessionId: string;
  userPrompt: string;
  workingDirectory: string;
}

/**
 * Team status update event
 */
export interface TeamStatusEvent {
  teamId: string;
  status: TeamStatus;
  members: Array<{
    agentId: string;
    status: TeamMemberStatus;
    currentTaskId?: string;
    tasksCompleted: number;
  }>;
  timestamp: Date;
}