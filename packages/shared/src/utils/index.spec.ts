import { generateId, generateShortId, delay, retry, formatDate, truncate, safeJsonParse } from './index';

describe('Utils', () => {
  describe('generateId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateShortId', () => {
    it('should generate an 8-character ID', () => {
      const id = generateShortId();
      expect(id).toHaveLength(8);
    });

    it('should only contain hexadecimal characters', () => {
      const id = generateShortId();
      expect(id).toMatch(/^[0-9a-f]{8}$/i);
    });

    it('should generate unique short IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateShortId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('delay', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now();
      await delay(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow for some timing variance
    });
  });

  describe('retry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(fn, { maxAttempts: 3, initialDelay: 10 }))
        .rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use custom retry options', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxAttempts: 2,
        initialDelay: 10,
        backoffFactor: 2,
      });
      expect(result).toBe('success');
    });
  });

  describe('formatDate', () => {
    it('should format Date object', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);
      // Result depends on locale, just check it's a string
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should format date string', () => {
      const formatted = formatDate('2024-01-15T10:30:00Z');
      expect(typeof formatted).toBe('string');
    });
  });

  describe('truncate', () => {
    it('should return original string if shorter than max length', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate and add ellipsis if longer than max length', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should handle exact length match', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    });

    it('should return fallback for invalid JSON', () => {
      expect(safeJsonParse('not json', { default: true })).toEqual({ default: true });
    });

    it('should parse arrays', () => {
      expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
    });

    it('should return fallback for malformed JSON', () => {
      expect(safeJsonParse('{"a":', null)).toBeNull();
    });
  });
});