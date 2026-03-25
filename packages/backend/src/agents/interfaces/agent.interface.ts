import { AgentConfig, AgentStatus, CliExecutionResult, ExecutionSummary, TaskContext, FileChange, HandoffRequest } from '@monkagents/shared';

export interface AgentExecutionContext {
  sessionId: string;
  taskId?: string;  // 可选，闲聊模式不需要
  subtaskId?: string;  // 可选，闲聊模式不需要
  workingDirectory: string;
  prompt: string;
  sessionWorkingDirectory?: string;

  // ===== 新增字段：多智能体协作上下文 =====

  /** 任务级上下文 */
  taskContext?: TaskContext;

  /** 前置任务的执行摘要 */
  previousSummaries?: ExecutionSummary[];

  /** 所有变更文件的汇总 */
  changedFiles?: FileChange[];

  /** handoff 来源信息 */
  handoffFrom?: {
    agentId: string;
    agentName: string;
    reason: string;
  };

  /** 当前 handoff 请求（如果是由 handoff 触发的执行） */
  handoffRequest?: HandoffRequest;
}

export interface AgentExecutionCallbacks {
  onInit?: (sessionId: string) => void;
  onText?: (sessionId: string, text: string) => void;
  onToolUse?: (sessionId: string, name: string, input: Record<string, unknown>) => void;
  onComplete?: (sessionId: string, result: CliExecutionResult) => void;
  onError?: (sessionId: string, error: string) => void;
}

export interface BaseAgent {
  getId(): string;
  getName(): string;
  getStatus(): AgentStatus;
  getConfig(): AgentConfig;
  canHandle(task: string): boolean;
  getPriorityWeight(task: string): number;
}

export interface ExecutableAgent extends BaseAgent {
  execute(context: AgentExecutionContext, callbacks?: AgentExecutionCallbacks): Promise<CliExecutionResult>;
  cancel(): void;
  isAvailable(): boolean;
  setWebSocketService(service: any): void; // 使用 any 类型以避免循环依赖
}

export interface AgentRegistrationOptions {
  singleton?: boolean;
  priority?: number;
}