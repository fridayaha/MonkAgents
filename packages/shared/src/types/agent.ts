/**
 * Agent status types
 */
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'offline';

/**
 * Agent roles based on Journey to the West characters
 */
export type AgentRole = 'master' | 'executor' | 'inspector' | 'assistant' | 'advisor';

/**
 * Agent configuration from YAML
 */
export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  role: AgentRole;
  persona: string;
  model: string;
  cli: {
    command: string;
    args: string[];
  };
  skills: string[];
  mcps: string[];
  capabilities: string[];
  boundaries: string[];
}

/**
 * Runtime agent state
 */
export interface AgentState {
  id: string;
  config: AgentConfig;
  status: AgentStatus;
  currentTaskId?: string;
  lastActivity?: Date;
  process?: {
    pid: number;
    startedAt: Date;
  };
}

/**
 * Agent capability definition
 */
export interface AgentCapability {
  name: string;
  description: string;
  skills?: string[];
}