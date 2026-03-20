/**
 * Message sender types
 */
export type MessageSender = 'user' | 'agent' | 'system';

/**
 * Message types
 */
export type MessageType =
  | 'text'          // Regular text message
  | 'thinking'      // Agent thinking output
  | 'tool_use'      // Tool call
  | 'tool_result'   // Tool result
  | 'status'        // Status update
  | 'error'         // Error message
  | 'stream'        // Streaming chunk
  | 'task_assignment' // Task assignment notification
  | 'chat_complete'; // Chat session complete

/**
 * Base message interface
 */
export interface Message {
  id: string;
  sessionId: string;
  taskId?: string;
  subtaskId?: string;
  sender: MessageSender;
  senderId: string;  // userId or agentId
  senderName: string;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Streaming message chunk
 */
export interface StreamChunk {
  messageId: string;
  index: number;
  content: string;
  isComplete: boolean;
}

/**
 * WebSocket message envelope
 */
export interface WSMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: Date;
}

/**
 * Client to server events
 */
export interface ClientToServerEvents {
  join: (sessionId: string) => void;
  leave: (sessionId: string) => void;
  message: (data: { sessionId: string; content: string }) => void;
  cancel: (taskId: string) => void;
}

/**
 * Server to client events
 */
export interface ServerToClientEvents {
  message: (data: Message) => void;
  agent_status: (data: { agentId: string; status: string }) => void;
  task_status: (data: { taskId: string; status: string }) => void;
  stream: (data: StreamChunk) => void;
  error: (data: { code: string; message: string }) => void;
}