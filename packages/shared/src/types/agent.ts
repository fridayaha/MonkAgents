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
 * Execution prompt template configuration
 */
export interface ExecutionPromptConfig {
  /** Additional instructions to append to persona */
  additionalInstructions?: string;
  /** Task-specific prompt template, use {task} as placeholder */
  taskTemplate?: string;
  /** Points to check/consider during execution */
  checklist?: string[];
}

/**
 * 智能体权限配置（简化版，用于YAML配置）
 * 详细的权限类型定义见 permission.ts
 */
export interface AgentPermissionYaml {
  /** 自动确认的工具列表 */
  autoApprove?: string[];
}

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
  /** 系统提示（人设） */
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
  /** 执行提示配置 */
  executionPrompt?: ExecutionPromptConfig;
  /** 权限配置 */
  permissions?: AgentPermissionYaml;

  // ===== 新增：适配器配置 =====

  /** 完全跳过权限确认（自动化场景） */
  dangerouslySkipPermissions?: boolean;

  /** 适配器类型，默认 'claude-local' */
  adapterType?: string;

  /** 适配器配置覆盖 */
  adapterConfig?: Record<string, unknown>;
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