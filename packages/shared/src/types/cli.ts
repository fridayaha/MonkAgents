/**
 * CLI output message types (NDJSON format from claude CLI)
 * Based on: claude -p "prompt" --output-format stream-json --verbose
 */

/**
 * CLI message type enumeration
 */
export type CliMessageType =
  | 'system'      // System messages (init, etc.)
  | 'assistant'   // Assistant response
  | 'user'        // User message echo
  | 'result'      // Final result
  | 'error';      // Error message

/**
 * CLI message subtype enumeration
 */
export type CliMessageSubtype =
  | 'init'        // Session initialization
  | 'success'     // Successful completion
  | 'error'       // Error occurred
  | 'cancelled';  // Cancelled by user

/**
 * CLI content block types
 */
export type CliContentBlockType =
  | 'text'        // Text content
  | 'tool_use'    // Tool usage
  | 'tool_result'; // Tool result

/**
 * CLI content block
 */
export interface CliContentBlock {
  type: CliContentBlockType;
  text?: string;
  name?: string;        // Tool name for tool_use
  id?: string;          // Tool use ID
  input?: Record<string, unknown>;   // Tool input
  content?: string | CliContentBlock[];  // Tool result content
  is_error?: boolean;
}

/**
 * CLI message structure
 */
export interface CliMessage {
  type: CliMessageType;
  subtype?: CliMessageSubtype;
  session_id?: string;
  message?: {
    id: string;
    type: 'message';
    role: 'assistant' | 'user';
    content: CliContentBlock[];
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  result?: string;
  error?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_tokens?: number;
}

/**
 * Parsed CLI output event
 */
export interface CliOutputEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'complete' | 'error';
  sessionId?: string;
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  isComplete?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CLI session state
 */
export interface CliSessionState {
  id: string;
  agentId: string;
  status: 'starting' | 'running' | 'idle' | 'error' | 'closed';
  pid?: number;
  startedAt: Date;
  lastActivity: Date;
  messageCount: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * CLI execution options
 */
export interface CliExecutionOptions {
  prompt: string;
  workingDirectory?: string;
  timeout?: number;
  onInit?: (sessionId: string) => void;
  onText?: (text: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (result: unknown) => void;
  onComplete?: (result: CliMessage) => void;
  onError?: (error: string) => void;
  onStream?: (event: CliOutputEvent) => void;
}

/**
 * CLI execution result
 */
export interface CliExecutionResult {
  success: boolean;
  sessionId?: string;
  output?: string;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  durationMs?: number;
  costUsd?: number;
}