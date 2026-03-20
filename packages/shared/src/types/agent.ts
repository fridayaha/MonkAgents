/**
 * Agent status types
 */
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'offline';

/**
 * Agent roles based on Journey to the West characters
 */
export type AgentRole = 'master' | 'executor' | 'inspector' | 'assistant' | 'advisor';

/**
 * Permission mode for agent execution
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan';

/**
 * Available tools for agents
 */
export type AgentTool = 'Read' | 'Edit' | 'Write' | 'Glob' | 'Grep' | 'Bash' | 'WebFetch' | 'WebSearch' | 'Agent';

/**
 * Agent configuration from YAML
 * 参考: https://code.claude.com/docs/zh-CN/sub-agents
 */
export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  role: AgentRole;
  /** 用于自动委托决策的描述 */
  description?: string;
  /** 系统提示 */
  persona: string;
  model: string;
  cli: {
    command: string;
    args: string[];
  };
  /** 允许使用的工具 */
  tools?: AgentTool[];
  /** 禁止使用的工具 */
  disallowedTools?: AgentTool[];
  skills: string[];
  mcps: string[];
  capabilities: string[];
  boundaries: string[];
  /** 权限模式 */
  permissionMode?: PermissionMode;
  /** 最大执行轮数 */
  maxTurns?: number;
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