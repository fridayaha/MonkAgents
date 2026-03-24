/**
 * 执行摘要相关类型定义
 * 用于智能体之间传递任务执行上下文
 */

/**
 * 智能体 ID 类型
 */
export type AgentId = 'tangseng' | 'wukong' | 'shaseng' | 'bajie' | 'rulai';

/**
 * 执行状态
 */
export type ExecutionStatus = 'completed' | 'partial' | 'failed';

/**
 * 文件变更动作
 */
export type FileChangeAction = 'created' | 'modified' | 'deleted';

/**
 * 输出项类型
 */
export type OutputType = 'file' | 'command' | 'analysis' | 'artifact';

/**
 * 问题类型
 */
export type IssueType = 'error' | 'warning' | 'question' | 'blocker';

/**
 * 优先级
 */
export type Priority = 'high' | 'medium' | 'low';

/**
 * 文件变更记录
 */
export interface FileChange {
  /** 文件相对路径 */
  path: string;
  /** 变更动作 */
  action: FileChangeAction;
  /** 变更摘要（可选，由智能体提供） */
  summary?: string;
  /** 新增行数 */
  linesAdded?: number;
  /** 删除行数 */
  linesDeleted?: number;
}

/**
 * 输出项
 */
export interface OutputItem {
  /** 输出类型 */
  type: OutputType;
  /** 描述 */
  description: string;
  /** 具体值（如命令输出、分析结果） */
  value?: string;
  /** 关联文件路径 */
  filePath?: string;
}

/**
 * 下一步建议（用于 handoff）
 */
export interface Suggestion {
  /** 目标智能体 ID */
  targetAgent: AgentId;
  /** 建议的任务 */
  task: string;
  /** 建议原因 */
  reason: string;
  /** 优先级 */
  priority?: Priority;
}

/**
 * 问题/阻塞点
 */
export interface Issue {
  /** 问题类型 */
  type: IssueType;
  /** 问题描述 */
  description: string;
  /** 是否已解决 */
  resolved?: boolean;
}

/**
 * 执行摘要 - 记录智能体任务执行的关键信息
 */
export interface ExecutionSummary {
  /** 任务完成状态 */
  status: ExecutionStatus;

  /** 文件变更（自动收集） */
  filesChanged: FileChange[];

  /** 关键产出（智能体报告） */
  outputs: OutputItem[];

  /** 下一步建议（用于 handoff） */
  suggestions?: Suggestion[];

  /** 遇到的问题 */
  issues?: Issue[];

  /** 执行耗时（秒） */
  duration?: number;

  /** 执行时间戳 */
  timestamp?: Date;
}

/**
 * 任务级上下文
 */
export interface TaskContext {
  /** 用户原始需求 */
  originalPrompt: string;
  /** 任务规划摘要 */
  planSummary: string;
  /** 当前执行轮次 */
  currentRound: number;
  /** 最大轮次限制 */
  maxRounds: number;
}

/**
 * Handoff 请求
 */
export interface HandoffRequest {
  /** 目标智能体 ID */
  targetAgentId: AgentId;
  /** 目标智能体名称 */
  targetAgentName?: string;
  /** 任务描述 */
  task: string;
  /** handoff 原因 */
  reason: string;
  /** handoff 次数 */
  handoffCount: number;
  /** 来源智能体 ID */
  sourceAgentId?: string;
  /** 来源智能体名称 */
  sourceAgentName?: string;
  /** 执行摘要 */
  executionSummary?: ExecutionSummary;
}

/**
 * 执行摘要构建器
 * 用于逐步构建执行摘要
 */
export class ExecutionSummaryBuilder {
  private status: ExecutionStatus = 'completed';
  private filesChanged: FileChange[] = [];
  private outputs: OutputItem[] = [];
  private suggestions: Suggestion[] = [];
  private issues: Issue[] = [];
  private duration?: number;

  setStatus(status: ExecutionStatus): this {
    this.status = status;
    return this;
  }

  addFileChange(path: string, action: FileChangeAction, summary?: string): this {
    this.filesChanged.push({ path, action, summary });
    return this;
  }

  addOutput(type: OutputType, description: string, value?: string, filePath?: string): this {
    this.outputs.push({ type, description, value, filePath });
    return this;
  }

  addSuggestion(targetAgent: AgentId, task: string, reason: string, priority?: Priority): this {
    this.suggestions.push({ targetAgent, task, reason, priority });
    return this;
  }

  addIssue(type: IssueType, description: string, resolved?: boolean): this {
    this.issues.push({ type, description, resolved });
    return this;
  }

  setDuration(duration: number): this {
    this.duration = duration;
    return this;
  }

  build(): ExecutionSummary {
    const summary: ExecutionSummary = {
      status: this.status,
      filesChanged: this.filesChanged,
      outputs: this.outputs,
      timestamp: new Date(),
    };

    if (this.suggestions.length > 0) {
      summary.suggestions = this.suggestions;
    }

    if (this.issues.length > 0) {
      summary.issues = this.issues;
    }

    if (this.duration !== undefined) {
      summary.duration = this.duration;
    }

    return summary;
  }
}