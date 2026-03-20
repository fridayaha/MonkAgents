import { CliOutputParser } from './cli.parser';

describe('CliOutputParser', () => {
  let parser: CliOutputParser;

  beforeEach(() => {
    parser = new CliOutputParser();
  });

  describe('parseChunk', () => {
    it('should parse system init message', () => {
      const chunk = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'test-session-123',
      }) + '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('init');
      expect(events[0].sessionId).toBe('test-session-123');
    });

    it('should parse assistant text message', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello, I am Claude.',
            },
          ],
        },
      }) + '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('text');
      expect(events[0].content).toBe('Hello, I am Claude.');
    });

    it('should parse tool_use block', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg-2',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'read_file',
              id: 'tool-1',
              input: { path: '/src/index.ts' },
            },
          ],
        },
      }) + '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool_use');
      expect(events[0].toolName).toBe('read_file');
      expect(events[0].toolInput).toEqual({ path: '/src/index.ts' });
    });

    it('should parse tool_result block', () => {
      const chunk = JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg-3',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_result',
              content: 'File content here',
            },
          ],
        },
      }) + '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool_result');
      expect(events[0].toolResult).toBe('File content here');
    });

    it('should parse result message', () => {
      const chunk = JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'test-session-456',
        result: 'Task completed successfully',
        cost_usd: 0.01,
        duration_ms: 1500,
      }) + '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complete');
      expect(events[0].content).toBe('Task completed successfully');
      expect(events[0].isComplete).toBe(true);
      expect(events[0].metadata?.costUsd).toBe(0.01);
      expect(events[0].metadata?.durationMs).toBe(1500);
    });

    it('should parse error message', () => {
      const chunk = JSON.stringify({
        type: 'error',
        error: 'Something went wrong',
      }) + '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].error).toBe('Something went wrong');
    });

    it('should handle multiple messages in one chunk', () => {
      const chunk =
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-1',
        }) +
        '\n' +
        JSON.stringify({
          type: 'assistant',
          message: {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
        }) +
        '\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('init');
      expect(events[1].type).toBe('text');
    });

    it('should handle incomplete JSON across chunks', () => {
      const chunk1 = '{"type":"assistant","message":{';
      const chunk2 = '"id":"msg-1","type":"message","role":"assistant","content":[{"type":"text","text":"Hi"}]}}\n';

      const events1 = parser.parseChunk(chunk1);
      const events2 = parser.parseChunk(chunk2);

      expect(events1).toHaveLength(0);
      expect(events2).toHaveLength(1);
      expect(events2[0].type).toBe('text');
    });

    it('should ignore empty lines', () => {
      const chunk = '\n\n\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(0);
    });

    it('should handle non-JSON output as text', () => {
      const chunk = 'This is plain text output\n';

      const events = parser.parseChunk(chunk);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('text');
      expect(events[0].content).toBe('This is plain text output');
    });
  });

  describe('getSessionId', () => {
    it('should return null initially', () => {
      expect(parser.getSessionId()).toBeNull();
    });

    it('should return session id after parsing init message', () => {
      parser.parseChunk(
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'my-session',
        }) + '\n',
      );

      expect(parser.getSessionId()).toBe('my-session');
    });
  });

  describe('reset', () => {
    it('should clear buffer and session id', () => {
      parser.parseChunk(
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'session-1',
        }) + '\n',
      );

      parser.reset();

      expect(parser.getSessionId()).toBeNull();
    });
  });

  describe('flush', () => {
    it('should parse remaining buffer', () => {
      parser.parseChunk('{"type":"result","result":"done"}');

      const events = parser.flush();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complete');
    });

    it('should clear buffer after flush', () => {
      parser.parseChunk('{"type":"result","result":"done"}');
      parser.flush();

      const events = parser.flush();

      expect(events).toHaveLength(0);
    });
  });
});