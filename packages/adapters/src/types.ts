/**
 * Adapter types for CLI tool execution
 * Inspired by Paperclip's adapter architecture
 */

/**
 * Streaming event types (same as CliOutputEvent in shared)
 */
export type StreamEventType =
  | 'init'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'complete'
  | 'error'
  | 'thinking'
  | 'permission_denial';

/**
 * Streaming event from CLI output
 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  messageId?: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  isPartial?: boolean;
  error?: string;
}

/**
 * Adapter execution context
 * Passed to adapter.execute() for each run
 */
export interface AdapterExecutionContext {
  /** Unique run ID for this execution */
  runId: string;

  /** Agent ID */
  agentId: string;

  /** Agent display name */
  agentName: string;

  /** Agent configuration */
  config: Record<string, unknown>;

  /** Runtime state (session info, etc.) */
  runtime: {
    sessionId?: string;
    sessionParams?: Record<string, unknown>;
  };

  /** Execution context */
  context: {
    workingDirectory: string;
    prompt: string;
    env?: Record<string, string>;
    /** MCP configuration JSON string */
    mcpConfig?: string;
    /** Allowed tools for auto-approval */
    allowedTools?: string[];
    /** Disallowed tools */
    disallowedTools?: string[];
    /** Permission mode */
    permissionMode?: string;
    /** Skills configuration for ephemeral skill directory */
    skills?: AdapterSkillsConfig;
  };

  /** Log callback for raw output */
  onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>;

  /** Event callback for parsed stream events */
  onEvent?: (event: StreamEvent) => void;

  /** Process spawn callback */
  onSpawn?: (meta: { pid: number; startedAt: string }) => Promise<void>;
}

/**
 * Skills configuration for CLI execution
 */
export interface AdapterSkillsConfig {
  /** Skills directory path (project root skills/) */
  skillsDirectory: string;
  /** Skill IDs to load (e.g., ['frontend-dev', 'minimax-pdf']) */
  skillIds: string[];
}

/**
 * Adapter execution result
 * Returned by adapter.execute() after completion
 */
export interface AdapterExecutionResult {
  /** Process exit code */
  exitCode: number | null;

  /** Process signal if killed */
  signal: string | null;

  /** Whether execution timed out */
  timedOut: boolean;

  /** Error message if failed */
  errorMessage: string | null;

  /** Error code for categorization */
  errorCode: string | null;

  /** New session ID from CLI */
  sessionId?: string | null;

  /** Session parameters for persistence */
  sessionParams?: Record<string, unknown> | null;

  /** Token usage summary */
  usage?: {
    inputTokens: number;
    cachedInputTokens?: number;
    outputTokens: number;
  };

  /** Cost in USD */
  costUsd?: number;

  /** Model used */
  model?: string;

  /** Raw result JSON from CLI */
  resultJson?: Record<string, unknown>;

  /** Human-readable summary */
  summary?: string;

  /** Whether to clear the saved session */
  clearSession?: boolean;

  /** Billing type: 'api' or 'subscription' */
  billingType?: 'api' | 'subscription';

  /** Provider name */
  provider?: string;

  /** Biller name */
  biller?: string;
}

/**
 * Adapter configuration
 * Defines how to invoke a CLI tool
 */
export interface AdapterConfig {
  /** Adapter type identifier */
  type: string;

  /** Human-readable label */
  label: string;

  /** CLI command to execute */
  command: string;

  /** Base CLI arguments */
  args: string[];

  /** Timeout in seconds */
  timeoutSec?: number;

  /** Grace period after SIGTERM before SIGKILL */
  graceSec?: number;

  /** Skip all permission confirmations */
  dangerouslySkipPermissions?: boolean;

  /** Maximum turns per run */
  maxTurns?: number;

  /** Model to use */
  model?: string;

  /** Additional CLI arguments */
  extraArgs?: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Chrome mode for browser */
  chrome?: boolean;

  /** Reasoning effort level */
  effort?: 'low' | 'medium' | 'high';

  /** Instructions file path */
  instructionsFilePath?: string;
}

/**
 * Adapter interface
 * All CLI adapters must implement this interface
 */
export interface Adapter {
  /** Adapter type identifier */
  readonly type: string;

  /** Human-readable label */
  readonly label: string;

  /** Execute a task */
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
}

/**
 * Run process result (internal use)
 */
export interface RunProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  pid: number | null;
  startedAt: string | null;
}

/**
 * Usage summary from CLI output
 */
export interface UsageSummary {
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}

/**
 * Parsed stream JSON result
 */
export interface ParsedStreamResult {
  sessionId: string | null;
  model: string;
  costUsd: number | null;
  usage: UsageSummary | null;
  summary: string;
  resultJson: Record<string, unknown> | null;
}

/**
 * Error meta information
 */
export interface ErrorMeta {
  loginUrl?: string | null;
}