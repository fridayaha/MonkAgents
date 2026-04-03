/**
 * Claude CLI Stream Parser
 * Parses NDJSON output from Claude Code CLI
 */

import { StreamEvent } from '../types';
import { parseJson, parseObject, asString } from '../base';

/**
 * Claude CLI stream parser
 * Handles NDJSON format output from --output-format stream-json --verbose
 */
export class ClaudeStreamParser {
  private buffer: string = '';

  /**
   * Parse a chunk of stdout data
   * Returns parsed events
   */
  parseChunk(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];

    // Process complete lines
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = parseJson(trimmed);
      if (!parsed) continue;

      const lineEvents = this.parseMessage(parsed);
      events.push(...lineEvents);
    }

    return events;
  }

  /**
   * Parse a single JSON message from Claude CLI
   */
  parseMessage(msg: Record<string, unknown>): StreamEvent[] {
    const events: StreamEvent[] = [];
    const type = asString(msg.type, '');

    switch (type) {
      case 'system':
        events.push(this.parseSystemMessage(msg));
        break;

      case 'assistant':
        events.push(...this.parseAssistantMessage(msg));
        break;

      case 'user':
        // User messages may contain tool_result blocks
        events.push(...this.parseUserMessage(msg));
        break;

      case 'result':
        events.push(this.parseResultMessage(msg));
        break;

      case 'stream_event':
        events.push(...this.parseStreamEvent(msg));
        break;

      case 'permission_denial':
        events.push(this.parsePermissionDenial(msg));
        break;
    }

    return events;
  }

  /**
   * Parse system init message
   */
  private parseSystemMessage(msg: Record<string, unknown>): StreamEvent {
    const subtype = asString(msg.subtype, '');
    return {
      type: 'init',
      sessionId: asString(msg.session_id, ''),
      content: subtype === 'init' ? 'Session initialized' : subtype,
    };
  }

  /**
   * Parse assistant message
   */
  private parseAssistantMessage(msg: Record<string, unknown>): StreamEvent[] {
    const events: StreamEvent[] = [];
    const sessionId = asString(msg.session_id, '');
    const messageId = asString(msg.id, '');

    const message = parseObject(msg.message);
    const content = Array.isArray(message.content) ? message.content : [];

    for (const entry of content) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const block = entry as Record<string, unknown>;
      const blockType = asString(block.type, '');

      switch (blockType) {
        case 'text':
          const text = asString(block.text, '');
          events.push({
            type: 'text',
            content: text,
            messageId,
            sessionId,
            isPartial: false,
          });
          break;

        case 'tool_use':
          events.push({
            type: 'tool_use',
            messageId,
            sessionId,
            toolName: asString(block.name, ''),
            toolInput: parseObject(block.input),
            isPartial: false,
          });
          break;

        case 'thinking':
          events.push({
            type: 'thinking',
            messageId,
            sessionId,
            content: asString(block.thinking, ''),
            isPartial: false,
          });
          break;
      }
    }

    // Add complete event
    events.push({
      type: 'complete',
      messageId,
      sessionId,
    });

    return events;
  }

  /**
   * Parse user message - may contain tool_result blocks
   */
  private parseUserMessage(msg: Record<string, unknown>): StreamEvent[] {
    const events: StreamEvent[] = [];
    const sessionId = asString(msg.session_id, '');

    const message = parseObject(msg.message);
    const content = Array.isArray(message.content) ? message.content : [];

    for (const entry of content) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const block = entry as Record<string, unknown>;
      const blockType = asString(block.type, '');

      if (blockType === 'tool_result') {
        events.push({
          type: 'tool_result',
          sessionId,
          toolResult: block.content,
        });
      }
    }

    return events;
  }

  /**
   * Parse result message
   */
  private parseResultMessage(msg: Record<string, unknown>): StreamEvent {
    return {
      type: 'complete',
      sessionId: asString(msg.session_id, ''),
      content: asString(msg.result, ''),
    };
  }

  /**
   * Parse stream_event message (partial streaming)
   */
  private parseStreamEvent(msg: Record<string, unknown>): StreamEvent[] {
    const events: StreamEvent[] = [];
    const messageId = asString(msg.message_id, '');
    const sessionId = asString(msg.session_id, '');

    const message = parseObject(msg.message);
    const content = Array.isArray(message.content) ? message.content : [];

    for (const entry of content) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const block = entry as Record<string, unknown>;
      const blockType = asString(block.type, '');

      switch (blockType) {
        case 'text':
          // Partial text stream
          events.push({
            type: 'text',
            content: asString(block.text, ''),
            messageId,
            sessionId,
            isPartial: true,
          });
          break;

        case 'tool_use':
          // Partial tool use (streaming)
          events.push({
            type: 'tool_use',
            messageId,
            sessionId,
            toolName: asString(block.name, ''),
            toolInput: parseObject(block.input),
            isPartial: true,
          });
          break;

        case 'thinking':
          events.push({
            type: 'thinking',
            messageId,
            sessionId,
            isPartial: true,
          });
          break;
      }
    }

    return events;
  }

  /**
   * Parse permission_denial message
   */
  private parsePermissionDenial(msg: Record<string, unknown>): StreamEvent {
    return {
      type: 'permission_denial',
      toolName: asString(msg.tool_name, ''),
      toolInput: parseObject(msg.input),
      error: asString(msg.reason, 'Permission denied'),
    };
  }

  /**
   * Flush remaining buffer and return any remaining events
   */
  flush(): StreamEvent[] {
    const events: StreamEvent[] = [];

    if (this.buffer.trim()) {
      const parsed = parseJson(this.buffer.trim());
      if (parsed) {
        const lineEvents = this.parseMessage(parsed);
        events.push(...lineEvents);
      }
    }

    this.buffer = '';
    return events;
  }

  /**
   * Get current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = '';
  }
}