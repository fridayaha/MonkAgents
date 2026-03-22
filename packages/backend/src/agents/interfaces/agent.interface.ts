import { AgentConfig, AgentStatus, CliExecutionResult } from '@monkagents/shared';

export interface AgentExecutionContext {
  sessionId: string;
  taskId: string;
  subtaskId: string;
  workingDirectory: string;
  prompt: string;
  sessionWorkingDirectory?: string;
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