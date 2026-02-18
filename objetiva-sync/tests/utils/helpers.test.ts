/**
 * Tests for helper utilities
 * Date formatting, SQL builders, string manipulation, etc.
 */

import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  sleep,
  chunk,
  retry,
  formatDuration,
  deepMerge,
  sanitizeSQL,
  truncate,
  capitalize,
  titleCase,
  parseSQLPlaceholders,
  toQueryString,
  parseQueryString,
  deepClone,
} from '../../src/utils/helpers.js';

describe('Helper Utils', () => {
  describe('Date functions', () => {
    it('should format date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);

      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(formatted).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should parse date string correctly', () => {
      const dateStr = '2024-01-15T00:00:00.000Z';
      const parsed = parseDate(dateStr);

      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getUTCFullYear()).toBe(2024);
      expect(parsed.getUTCMonth()).toBe(0); // January is 0
      expect(parsed.getUTCDate()).toBe(15);
    });

    it('should throw error on invalid date string', () => {
      expect(() => parseDate('invalid-date')).toThrow('Fecha inválida');
    });
  });

  describe('SQL functions', () => {
    it('should sanitize SQL strings correctly', () => {
      expect(sanitizeSQL("O'Brien")).toBe("O''Brien");
      expect(sanitizeSQL("It's a test")).toBe("It''s a test");
      expect(sanitizeSQL('Normal text')).toBe('Normal text');
    });

    it('should parse SQL placeholders', () => {
      const sql = 'SELECT * FROM table WHERE id = :id AND status = :status';
      const result = parseSQLPlaceholders(sql, { id: 123, status: 'active' });

      expect(result).toContain('id = 123');
      expect(result).toContain("status = 'active'");
    });
  });

  describe('String functions', () => {
    it('should truncate long strings', () => {
      const longStr = 'This is a very long string that needs to be truncated';
      const truncated = truncate(longStr, 20);

      expect(truncated).toHaveLength(20);
      expect(truncated).toMatch(/\.\.\.$/);
    });

    it('should not truncate short strings', () => {
      const shortStr = 'Short';
      const result = truncate(shortStr, 20);

      expect(result).toBe('Short');
    });

    it('should capitalize strings', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('WORLD')).toBe('World');
      expect(capitalize('')).toBe('');
    });

    it('should convert to title case', () => {
      expect(titleCase('hello world')).toBe('Hello World');
      expect(titleCase('HELLO WORLD')).toBe('Hello World');
    });
  });

  describe('Array functions', () => {
    it('should chunk array correctly', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const chunks = chunk(array, 3);

      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual([1, 2, 3]);
      expect(chunks[1]).toEqual([4, 5, 6]);
      expect(chunks[2]).toEqual([7, 8, 9]);
      expect(chunks[3]).toEqual([10]);
    });

    it('should handle empty array', () => {
      const chunks = chunk([], 3);
      expect(chunks).toEqual([]);
    });

    it('should handle chunk size larger than array', () => {
      const array = [1, 2, 3];
      const chunks = chunk(array, 10);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual([1, 2, 3]);
    });
  });

  describe('Async functions', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(95); // Allow small margin
      expect(duration).toBeLessThan(150);
    });

    it('should retry function on failure', async () => {
      let attempts = 0;
      const flakyFunction = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retry(flakyFunction, { maxAttempts: 5, delayMs: 10 });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw error after max retries', async () => {
      const alwaysFailFunction = async () => {
        throw new Error('Always fails');
      };

      await expect(retry(alwaysFailFunction, { maxAttempts: 3, delayMs: 10 })).rejects.toThrow(
        'Always fails'
      );
    });
  });

  describe('Formatting functions', () => {
    it('should format duration correctly', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1500)).toMatch(/1\.\d+s/); // Decimal format for seconds
      expect(formatDuration(65000)).toMatch(/1\.\d+m/); // Decimal format for minutes
      expect(formatDuration(3665000)).toMatch(/1\.\d+h/); // Decimal format for hours
    });
  });

  describe('Query string functions', () => {
    it('should convert object to query string', () => {
      const params = { name: 'John Doe', age: 30, active: true };
      const queryString = toQueryString(params);

      expect(queryString).toContain('name=John%20Doe');
      expect(queryString).toContain('age=30');
      expect(queryString).toContain('active=true');
    });

    it('should parse query string to object', () => {
      const queryString = 'name=John%20Doe&age=30&active=true';
      const params = parseQueryString(queryString);

      expect(params).toEqual({
        name: 'John Doe',
        age: '30',
        active: 'true',
      });
    });

    it('should handle query string with leading question mark', () => {
      const queryString = '?key1=value1&key2=value2';
      const params = parseQueryString(queryString);

      expect(params).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });
  });

  describe('Object functions', () => {
    it('should deep clone objects', () => {
      const obj = {
        name: 'John',
        nested: {
          value: 42,
        },
      };

      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj); // Different reference
      expect(cloned.nested).not.toBe(obj.nested); // Deep clone
    });

    it('should deep merge objects correctly', () => {
      const obj1 = {
        a: 1,
        b: { x: 10, y: 20 },
        c: [1, 2],
      };

      const obj2 = {
        b: { y: 30, z: 40 },
        c: [3, 4],
        d: 'new',
      };

      const merged = deepMerge(obj1, obj2);

      expect(merged.a).toBe(1);
      expect(merged.b).toEqual({ x: 10, y: 30, z: 40 });
      expect(merged.c).toEqual([3, 4]); // Arrays are replaced, not merged
      expect(merged.d).toBe('new');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings in capitalize', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle empty arrays in chunk', () => {
      expect(chunk([], 5)).toEqual([]);
    });

    it('should handle empty query strings', () => {
      expect(parseQueryString('')).toEqual({});
    });
  });
});
