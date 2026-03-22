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
  | 'error'       // Error message
  | 'stream_event'; // Streaming event (with --include-partial-messages)

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
  | 'tool_result' // Tool result
  | 'thinking';   // Thinking content (extended thinking)

/**
 * Stream event delta types
 */
export type StreamDeltaType =
  | 'text_delta'       // Text content delta
  | 'thinking_delta'   // Thinking content delta
  | 'input_json_delta' // Tool input JSON delta
  | 'signature_delta'; // Thinking signature delta

/**
 * Stream event types
 */
export type StreamEventType =
  | 'message_start'         // Message started
  | 'content_block_start'   // Content block started
  | 'content_block_delta'   // Content block delta
  | 'content_block_stop'    // Content block stopped
  | 'message_stop';         // Message stopped

/**
 * Stream event delta
 */
export interface StreamEventDelta {
  type: StreamDeltaType;
  text?: string;       // For text_delta
  thinking?: string;   // For thinking_delta
  partial_json?: string; // For input_json_delta
  signature?: string;  // For signature_delta
}

/**
 * Stream event content block
 */
export interface StreamEventContentBlock {
  type: CliContentBlockType;
  text?: string;
  thinking?: string;
  signature?: string;
  name?: string;    // Tool name for tool_use
  input?: Record<string, unknown>;
  id?: string;
}

/**
 * Stream event structure
 */
export interface StreamEvent {
  type: StreamEventType;
  message?: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: CliContentBlock[];
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  content_block?: StreamEventContentBlock;
  delta?: StreamEventDelta;
  index?: number;
}

/**
 * CLI content block
 */
export interface CliContentBlock {
  type: CliContentBlockType;
  text?: string;
  thinking?: string;
  signature?: string;
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
  partial?: boolean;  // true when --include-partial-messages is used
  uuid?: string;      // Unique ID for each message
  parent_tool_use_id?: string | null;
  // For stream_event type messages
  event?: StreamEvent;
  // For assistant type messages
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
  // System init fields
  cwd?: string;
  tools?: string[];
  mcp_servers?: unknown[];
  model?: string;
  permissionMode?: string;
  slash_commands?: string[];
  apiKeySource?: string;
  claude_code_version?: string;
  output_style?: string;
  agents?: string[];
  skills?: string[];
  plugins?: unknown[];
  fast_mode_state?: string;
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
  isPartial?: boolean;  // true for partial streaming chunks
  messageId?: string;   // message ID for tracking streaming
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CLI session state
 */
export interface CliSessionState {
  id: string;
  agentId: string;
  status: 'starting' | 'running' | 'idle' | 'completed' | 'error' | 'closed';
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