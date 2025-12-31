/**
 * Unit Tests for DefaultRuleSource
 * Tests rule fetching, caching, and error handling
 */

import { vi } from 'vitest';
import { DefaultRuleSource } from '@modules/rule-execution/sources/default-rule-source.js';
import { safeStorageGet } from '@script-utils/chromeApiSafe.js';

vi.mock('../../../../src/scripts/utils/chromeApiSafe.js');

describe('DefaultRuleSource', () => {
  let source;
  const mockRules = [
    { id: '1', selector: '.ad', enabled: true, domains: ['*'] },
    { id: '2', selector: '#banner', enabled: true, domains: ['example.com'] }
  ];

  beforeEach(() => {
    source = new DefaultRuleSource();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Properties', () => {
    test('should return correct source name', () => {
      expect(source.getName()).toBe('Default Selector Rules');
    });

    test('should return correct executor type', () => {
      expect(source.getExecutorType()).toBe('selector');
    });

    test('should return correct cache key', () => {
      expect(source.getCacheKey()).toBe('defaultRules');
    });

    test('should return correct update interval', () => {
      expect(source.getUpdateInterval()).toBe(0);
    });
  });

  describe('fetchRules()', () => {
    test('should fetch rules from chrome.storage', async () => {
      safeStorageGet.mockResolvedValue({ defaultRules: mockRules });

      const rules = await source.fetchRules();

      expect(safeStorageGet).toHaveBeenCalledWith(['defaultRules']);
      expect(rules).toEqual(mockRules);
    });

    test('should return empty array when storage returns undefined', async () => {
      safeStorageGet.mockResolvedValue({});

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });

    test('should return empty array when storage returns null', async () => {
      safeStorageGet.mockResolvedValue({ defaultRules: null });

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });
  });

  describe('Caching', () => {
    test('should cache rules with 60-second TTL', async () => {
      safeStorageGet.mockResolvedValue({ defaultRules: mockRules });

      // First fetch
      const rules1 = await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1);

      // Second fetch within TTL
      vi.advanceTimersByTime(30000); // 30 seconds
      const rules2 = await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1); // Should use cache
      expect(rules2).toEqual(mockRules);
    });

    test('should fetch fresh rules after TTL expires', async () => {
      const updatedRules = [
        { id: '3', selector: '.new-ad', enabled: true, domains: ['*'] }
      ];

      safeStorageGet
        .mockResolvedValueOnce({ defaultRules: mockRules })
        .mockResolvedValueOnce({ defaultRules: updatedRules });

      // First fetch
      const rules1 = await source.fetchRules();
      expect(rules1).toEqual(mockRules);
      expect(safeStorageGet).toHaveBeenCalledTimes(1);

      // Advance past TTL (60 seconds + 1ms)
      vi.advanceTimersByTime(60001);

      // Second fetch should get fresh data
      const rules2 = await source.fetchRules();
      expect(rules2).toEqual(updatedRules);
      expect(safeStorageGet).toHaveBeenCalledTimes(2);
    });

    test('should return cached rules within TTL even with multiple calls', async () => {
      safeStorageGet.mockResolvedValue({ defaultRules: mockRules });

      // Multiple fetches within TTL
      const rules1 = await source.fetchRules();
      vi.advanceTimersByTime(10000);
      const rules2 = await source.fetchRules();
      vi.advanceTimersByTime(10000);
      const rules3 = await source.fetchRules();

      expect(safeStorageGet).toHaveBeenCalledTimes(1);
      expect(rules1).toEqual(mockRules);
      expect(rules2).toEqual(mockRules);
      expect(rules3).toEqual(mockRules);
    });
  });

  describe('Error Handling', () => {
    test('should return empty array on storage error', async () => {
      safeStorageGet.mockRejectedValue(new Error('Storage error'));

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });

    test('should return cached rules on storage error if available', async () => {
      safeStorageGet
        .mockResolvedValueOnce({ defaultRules: mockRules })
        .mockRejectedValueOnce(new Error('Storage error'));

      // First fetch succeeds
      const rules1 = await source.fetchRules();
      expect(rules1).toEqual(mockRules);

      // Expire cache
      vi.advanceTimersByTime(60001);

      // Second fetch fails but returns cached rules
      const rules2 = await source.fetchRules();
      expect(rules2).toEqual(mockRules);
    });

    test('should handle storage returning invalid data gracefully', async () => {
      safeStorageGet.mockResolvedValue({ defaultRules: 'invalid' });

      // Should not throw, but return the invalid data
      // (parser will handle filtering invalid rules)
      const rules = await source.fetchRules();
      expect(rules).toBe('invalid');
    });
  });

  describe('invalidateCache()', () => {
    test('should clear cache immediately', async () => {
      safeStorageGet
        .mockResolvedValueOnce({ defaultRules: mockRules })
        .mockResolvedValueOnce({ defaultRules: [] });

      // First fetch and cache
      await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1);

      // Invalidate cache
      source.invalidateCache();

      // Next fetch should get fresh data
      const rules = await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(2);
      expect(rules).toEqual([]);
    });

    test('should allow immediate re-fetch after invalidation', async () => {
      const updatedRules = [
        { id: '3', selector: '.new-ad', enabled: true, domains: ['*'] }
      ];

      safeStorageGet
        .mockResolvedValueOnce({ defaultRules: mockRules })
        .mockResolvedValueOnce({ defaultRules: updatedRules });

      // Fetch and cache
      await source.fetchRules();

      // Invalidate
      source.invalidateCache();

      // Immediate fetch should get new data
      const rules = await source.fetchRules();
      expect(rules).toEqual(updatedRules);
      expect(safeStorageGet).toHaveBeenCalledTimes(2);
    });
  });
});
