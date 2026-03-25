/**
 * Permission types for tool execution approval
 * 工具执行权限确认相关类型定义
 */

/**
 * 权限操作类型
 */
export type PermissionAction = 'allow' | 'deny' | 'ask';

/**
 * 工具类别
 */
export type ToolCategory =
  | 'file_read'      // Read, Glob, Grep
  | 'file_write'     // Write, Edit
  | 'bash_safe'      // Bash (非危险命令)
  | 'bash_dangerous' // Bash (rm, sudo, etc.)
  | 'network'        // WebFetch, WebSearch
  | 'agent'          // Agent (子智能体调用)
  | 'other';         // 其他工具

/**
 * 权限规则
 */
export interface PermissionRule {
  /** 工具名，支持通配符 "Bash(git *)" */
  toolName?: string;
  /** 工具类别 */
  toolCategory?: ToolCategory;
  /** 允许/拒绝/询问 */
  action: PermissionAction;
  /** 条件匹配 */
  conditions?: {
    /** 文件路径匹配模式 */
    pathPattern?: string;
    /** 命令匹配模式 */
    commandPattern?: string;
    /** 域名匹配模式 (网络) */
    domainPattern?: string;
  };
  /** 规则描述 */
  description?: string;
}

/**
 * 权限确认请求
 */
export interface PermissionRequest {
  /** 请求ID */
  id: string;
  /** 会话ID */
  sessionId: string;
  /** 智能体ID */
  agentId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具类别 */
  toolCategory: ToolCategory;
  /** 工具输入参数 */
  input: Record<string, unknown>;
  /** 操作描述 */
  description?: string;
  /** 风险等级 */
  risk: 'low' | 'medium' | 'high';
  /** 请求时间 */
  timestamp: Date;
}

/**
 * 权限确认响应
 */
export interface PermissionResponse {
  /** 请求ID */
  requestId: string;
  /** 同意/拒绝 */
  action: 'allow' | 'deny';
  /** 记住此决定 */
  remember?: boolean;
  /** 拒绝原因 */
  reason?: string;
}

/**
 * 记住的决定（会话级别）
 */
export interface RememberedDecision {
  /** 匹配模式 */
  pattern: string;
  /** 同意/拒绝 */
  action: 'allow' | 'deny';
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 智能体权限配置
 */
export interface AgentPermissionConfig {
  /** 智能体ID */
  agentId: string;
  /** 自动确认规则 */
  autoApprove: PermissionRule[];
  /** 需要确认的规则（暂未使用，保留扩展） */
  askRules?: PermissionRule[];
  /** 拒绝规则（暂未使用，保留扩展） */
  denyRules?: PermissionRule[];
}

/**
 * 权限拒绝记录（来自CLI输出）
 */
export interface PermissionDenial {
  /** 工具名称 */
  tool_name: string;
  /** 工具调用ID */
  tool_use_id: string;
  /** 工具输入参数 */
  tool_input: Record<string, unknown>;
}

/**
 * 权限确认请求消息（WebSocket -> 前端）
 */
export interface PermissionRequestMessage {
  /** 消息类型 */
  type: 'permission_request';
  /** 请求ID */
  id: string;
  /** 会话ID */
  sessionId: string;
  /** 智能体ID */
  agentId: string;
  /** 智能体名称 */
  agentName: string;
  /** 工具名称 */
  toolName: string;
  /** 工具类别 */
  toolCategory: ToolCategory;
  /** 工具输入参数 */
  input: Record<string, unknown>;
  /** 操作描述 */
  description?: string;
  /** 风险等级 */
  risk: 'low' | 'medium' | 'high';
  /** 请求时间 */
  timestamp?: Date;
}

/**
 * 权限确认响应事件（前端 -> WebSocket）
 */
export interface PermissionResponseEvent {
  /** 事件类型 */
  event: 'permission_response';
  /** 请求ID */
  requestId: string;
  /** 同意/拒绝 */
  action: 'allow' | 'deny';
  /** 记住此决定 */
  remember: boolean;
  /** 拒绝原因 */
  reason?: string;
}

/**
 * 危险命令模式列表
 */
export const DANGEROUS_COMMAND_PATTERNS = [
  /^rm\s/,           // 删除命令
  /^rm\s+-/,         // 删除命令带参数
  /sudo\s/,          // sudo提权
  />\s*\/dev\//,     // 写入设备文件
  /mkfs/,            // 格式化
  /dd\s+if=/,        // dd命令
  /:\(\)\{\s*:\|:&\s*\};:/, // Fork bomb
  /chmod\s+777/,     // 危险权限修改
  /chown\s+.*root/,  // 所有者修改
  />\s*\/etc\//,     // 写入系统配置
  /curl.*\|.*sh/,    // 远程脚本执行
  /wget.*\|.*sh/,    // 远程脚本执行
];

/**
 * 安全命令模式列表
 */
export const SAFE_COMMAND_PATTERNS = [
  /^git\s/,          // Git命令
  /^npm\s/,          // NPM命令
  /^node\s/,         // Node命令
  /^npx\s/,          // NPX命令
  /^pnpm\s/,         // PNPM命令
  /^yarn\s/,         // Yarn命令
  /^ls\s/,           // 列出文件
  /^cat\s/,          // 查看文件
  /^echo\s/,         // 输出
  /^pwd$/,           // 当前目录
  /^which\s/,        // 查找命令
  /^head\s/,         // 文件头部
  /^tail\s/,         // 文件尾部
  /^grep\s/,         // 搜索
  /^find\s/,         // 查找文件
];

/**
 * 工具到类别的映射
 */
export const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  Read: 'file_read',
  Glob: 'file_read',
  Grep: 'file_read',
  Write: 'file_write',
  Edit: 'file_write',
  NotebookEdit: 'file_write',
  WebFetch: 'network',
  WebSearch: 'network',
  Agent: 'agent',
  Bash: 'bash_safe', // 默认安全，需要进一步分析命令
  Task: 'other',
  TaskOutput: 'other',
  TaskStop: 'other',
  AskUserQuestion: 'other',
  Skill: 'other',
  EnterPlanMode: 'other',
  ExitPlanMode: 'other',
  EnterWorktree: 'other',
  ExitWorktree: 'other',
  CronCreate: 'other',
  CronDelete: 'other',
  CronList: 'other',
};