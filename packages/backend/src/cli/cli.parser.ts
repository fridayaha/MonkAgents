import { Logger } from '@nestjs/common';
import {
  CliMessage,
  CliOutputEvent,
  CliContentBlock,
} from '@monkagents/shared';

/**
 * Parser for Claude CLI stream-json output
 * Handles NDJSON format: {"type":"...", ...}\n{"type":"...", ...}\n
 */
export class CliOutputParser {
  private readonly logger = new Logger(CliOutputParser.name);
  private buffer: string = '';
  private sessionId: string | null = null;

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
   * Parse assistant message with content blocks
   */
  private parseAssistantMessage(message: CliMessage): CliOutputEvent[] {
    const events: CliOutputEvent[] = [];

    if (!message.message?.content) return events;

    for (const block of message.message.content) {
      const event = this.parseContentBlock(block);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Parse a content block
   */
  private parseContentBlock(block: CliContentBlock): CliOutputEvent | null {
    switch (block.type) {
      case 'text':
        return {
          type: 'text',
          content: block.text || '',
          sessionId: this.sessionId || undefined,
        };

      case 'tool_use':
        return {
          type: 'tool_use',
          toolName: block.name,
          toolInput: block.input,
          sessionId: this.sessionId || undefined,
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