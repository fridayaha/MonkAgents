import { Logger } from '@nestjs/common';
import {
  CliMessage,
  CliOutputEvent,
  CliContentBlock,
} from '@monkagents/shared';

/**
 * Parser for Claude CLI stream-json output
 * Handles NDJSON format: {"type":"...", ...}\n{"type":"...", ...}\n
 * Supports both regular messages and stream_event messages (with --include-partial-messages)
 */
export class CliOutputParser {
  private readonly logger = new Logger(CliOutputParser.name);
  private buffer: string = '';
  private sessionId: string | null = null;
  private currentMessageId: string | null = null;

  /**
   * Parse a chunk of CLI output
   * Returns array of parsed events
   */
  parseChunk(chunk: string): CliOutputEvent[] {
    this.buffer += chunk;
    const events: CliOutputEvent[] = [];
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as CliMessage;
        const parsedEvents = this.parseMessage(message);
        if (parsedEvents.length > 0) {
          this.logger.debug(`Parsed ${parsedEvents.length} events from message type: ${message.type}`);
        }
        events.push(...parsedEvents);
      } catch (error) {
        // If JSON parse fails, might be incomplete or non-JSON output
        this.logger.debug(`Failed to parse line: ${trimmed.substring(0, 100)}...`);
        // Treat as plain text output
        events.push({
          type: 'text',
          content: trimmed,
        });
      }
    }

    return events;
  }

  /**
   * Parse a complete CLI message
   */
  parseMessage(message: CliMessage): CliOutputEvent[] {
    const events: CliOutputEvent[] = [];

    switch (message.type) {
      case 'system':
        events.push(...this.parseSystemMessage(message));
        break;
      case 'stream_event':
        events.push(...this.parseStreamEvent(message));
        break;
      case 'assistant':
        events.push(...this.parseAssistantMessage(message));
        break;
      case 'result':
        events.push(...this.parseResultMessage(message));
        break;
      case 'error':
        events.push(this.parseErrorMessage(message));
        break;
      case 'user':
        // Usually just echo, skip
        break;
    }

    return events;
  }

  /**
   * Parse system message (init, etc.)
   */
  private parseSystemMessage(message: CliMessage): CliOutputEvent[] {
    if (message.subtype === 'init' && message.session_id) {
      this.sessionId = message.session_id;
      return [{
        type: 'init',
        sessionId: message.session_id,
      }];
    }
    return [];
  }

  /**
   * Parse stream_event message (with --include-partial-messages)
   * This is the true streaming format
   */
  private parseStreamEvent(message: CliMessage): CliOutputEvent[] {
    const events: CliOutputEvent[] = [];
    const event = message.event;
    if (!event) return events;

    // Update session ID if available
    if (message.session_id) {
      this.sessionId = message.session_id;
    }

    switch (event.type) {
      case 'message_start':
        if (event.message?.id) {
          this.currentMessageId = event.message.id;
          this.logger.debug(`Message started: ${this.currentMessageId}`);
        }
        break;

      case 'content_block_start':
        if (event.content_block) {
          // Handle thinking block start
          if (event.content_block.type === 'thinking') {
            events.push({
              type: 'thinking',
              content: '',
              isPartial: true,
              messageId: this.currentMessageId || undefined,
              sessionId: this.sessionId || undefined,
            });
          }
        }
        break;

      case 'content_block_delta':
        if (event.delta) {
          const delta = event.delta;

          // Text delta - actual content streaming
          if (delta.type === 'text_delta' && delta.text) {
            this.logger.debug(`Text delta: "${delta.text.substring(0, 30)}..." (messageId: ${this.currentMessageId})`);
            events.push({
              type: 'text',
              content: delta.text,
              isPartial: true,
              messageId: this.currentMessageId || undefined,
              sessionId: this.sessionId || undefined,
            });
          }
          // Thinking delta - extended thinking streaming
          else if (delta.type === 'thinking_delta' && delta.thinking) {
            events.push({
              type: 'thinking',
              content: delta.thinking,
              isPartial: true,
              messageId: this.currentMessageId || undefined,
              sessionId: this.sessionId || undefined,
            });
          }
        }
        break;

      case 'content_block_stop':
        // Content block finished
        break;

      case 'message_stop':
        // Message completed
        this.logger.debug(`Message completed: ${this.currentMessageId}`);
        events.push({
          type: 'complete',
          content: '',
          isComplete: true,
          messageId: this.currentMessageId || undefined,
          sessionId: this.sessionId || undefined,
        });
        break;
    }

    return events;
  }

  /**
   * Parse assistant message with content blocks
   * Handles both complete and partial messages
   */
  private parseAssistantMessage(message: CliMessage): CliOutputEvent[] {
    const events: CliOutputEvent[] = [];

    if (!message.message?.content) return events;

    const isPartial = message.partial === true;
    const messageId = message.message.id;

    for (const block of message.message.content) {
      const event = this.parseContentBlock(block, isPartial, messageId);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Parse a content block
   */
  private parseContentBlock(block: CliContentBlock, isPartial: boolean = false, messageId?: string): CliOutputEvent | null {
    switch (block.type) {
      case 'text':
        return {
          type: 'text',
          content: block.text || '',
          sessionId: this.sessionId || undefined,
          isPartial,
          messageId,
        };

      case 'thinking':
        return {
          type: 'thinking',
          content: block.thinking || '',
          sessionId: this.sessionId || undefined,
          isPartial,
          messageId,
        };

      case 'tool_use':
        return {
          type: 'tool_use',
          toolName: block.name,
          toolInput: block.input,
          sessionId: this.sessionId || undefined,
          isPartial,
          messageId,
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          toolResult: typeof block.content === 'string'
            ? block.content
            : block.content,
          sessionId: this.sessionId || undefined,
          metadata: {
            isError: block.is_error,
          },
          messageId,
        };

      default:
        return null;
    }
  }

  /**
   * Parse result message (completion)
   */
  private parseResultMessage(message: CliMessage): CliOutputEvent[] {
    const events: CliOutputEvent[] = [];

    events.push({
      type: 'complete',
      content: message.result || '',
      isComplete: true,
      sessionId: this.sessionId || undefined,
      metadata: {
        costUsd: message.cost_usd,
        durationMs: message.duration_ms,
        tokensUsed: message.total_tokens,
        numTurns: message.num_turns,
      },
    });

    return events;
  }

  /**
   * Parse error message
   */
  private parseErrorMessage(message: CliMessage): CliOutputEvent {
    return {
      type: 'error',
      error: message.error || message.message?.content?.[0]?.text || 'Unknown error',
      sessionId: this.sessionId || undefined,
    };
  }

  /**
   * Get remaining buffer content (for flush check)
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = '';
    this.sessionId = null;
    this.currentMessageId = null;
  }

  /**
   * Flush remaining buffer (call at end of stream)
   */
  flush(): CliOutputEvent[] {
    const events: CliOutputEvent[] = [];

    if (this.buffer.trim()) {
      try {
        const message = JSON.parse(this.buffer.trim()) as CliMessage;
        const parsedEvents = this.parseMessage(message);
        events.push(...parsedEvents);
      } catch {
        // Ignore incomplete JSON at end
      }
    }

    this.buffer = '';
    return events;
  }
}