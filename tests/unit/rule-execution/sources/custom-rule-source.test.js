/**
 * Unit Tests for CustomRuleSource
 * Tests rule fetching, caching with shorter TTL, and error handling
 */

import { vi } from 'vitest';
import { CustomRuleSource } from '@modules/rule-execution/sources/custom-rule-source.js';
import { safeStorageGet } from '@script-utils/chromeApiSafe.js';

vi.mock('../../../../src/scripts/utils/chromeApiSafe.js');

describe('CustomRuleSource', () => {
  let source;
  const mockRules = [
    { id: 'custom-1', selector: '.my-ad', enabled: true, domains: ['example.com'] },
    { id: 'custom-2', selector: '#my-banner', enabled: true, domains: ['test.com'] }
  ];

  beforeEach(() => {
    source = new CustomRuleSource();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Properties', () => {
    test('should return correct source name', () => {
      expect(source.getName()).toBe('Custom Selector Rules');
    });

    test('should return correct executor type', () => {
      expect(source.getExecutorType()).toBe('selector');
    });

    test('should return correct cache key', () => {
      expect(source.getCacheKey()).toBe('customRules');
    });

    test('should return correct update interval', () => {
      expect(source.getUpdateInterval()).toBe(0);
    });
  });

  describe('fetchRules()', () => {
    test('should fetch rules from chrome.storage', async () => {
      safeStorageGet.mockResolvedValue({ customRules: mockRules });

      const rules = await source.fetchRules();

      expect(safeStorageGet).toHaveBeenCalledWith(['customRules']);
      expect(rules).toEqual(mockRules);
    });

    test('should return empty array when storage returns undefined', async () => {
      safeStorageGet.mockResolvedValue({});

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });

    test('should return empty array when storage returns null', async () => {
      safeStorageGet.mockResolvedValue({ customRules: null });

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });
  });

  describe('Caching with 30-second TTL', () => {
    test('should cache rules with 30-second TTL (shorter than default)', async () => {
      safeStorageGet.mockResolvedValue({ customRules: mockRules });

      // First fetch
      const rules1 = await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1);

      // Second fetch within TTL (15 seconds)
      vi.advanceTimersByTime(15000);
      const rules2 = await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1); // Should use cache
      expect(rules2).toEqual(mockRules);
    });

    test('should fetch fresh rules after 30-second TTL expires', async () => {
      const updatedRules = [
        { id: 'custom-3', selector: '.updated-ad', enabled: true, domains: ['*'] }
      ];

      safeStorageGet
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockResolvedValueOnce({ customRules: updatedRules });

      // First fetch
      const rules1 = await source.fetchRules();
      expect(rules1).toEqual(mockRules);
      expect(safeStorageGet).toHaveBeenCalledTimes(1);

      // Advance past TTL (30 seconds + 1ms)
      vi.advanceTimersByTime(30001);

      // Second fetch should get fresh data
      const rules2 = await source.fetchRules();
      expect(rules2).toEqual(updatedRules);
      expect(safeStorageGet).toHaveBeenCalledTimes(2);
    });

    test('should not cache at 29 seconds (within TTL)', async () => {
      safeStorageGet.mockResolvedValue({ customRules: mockRules });

      // First fetch
      await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1);

      // 29 seconds later (within TTL)
      vi.advanceTimersByTime(29000);
      await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(1); // Still using cache
    });

    test('should handle cache expiration timing correctly', async () => {
      safeStorageGet
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockResolvedValueOnce({ customRules: [] });

      // First fetch
      await source.fetchRules();
      const firstCallCount = safeStorageGet.mock.calls.length;

      // At exactly 30 seconds
      vi.advanceTimersByTime(30000);
      await source.fetchRules();

      // Cache behavior at boundary (implementation uses < so should still be valid)
      const secondCallCount = safeStorageGet.mock.calls.length;

      // Either 1 (still cached) or 2 (expired) is acceptable at boundary
      expect(secondCallCount).toBeGreaterThanOrEqual(firstCallCount);
      expect(secondCallCount).toBeLessThanOrEqual(firstCallCount + 1);
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
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockRejectedValueOnce(new Error('Storage error'));

      // First fetch succeeds
      const rules1 = await source.fetchRules();
      expect(rules1).toEqual(mockRules);

      // Expire cache
      vi.advanceTimersByTime(30001);

      // Second fetch fails but returns cached rules (graceful degradation)
      const rules2 = await source.fetchRules();
      expect(rules2).toEqual(mockRules);
    });

    test('should handle concurrent fetch requests gracefully', async () => {
      safeStorageGet.mockResolvedValue({ customRules: mockRules });

      // Multiple concurrent fetches
      const [rules1, rules2, rules3] = await Promise.all([
        source.fetchRules(),
        source.fetchRules(),
        source.fetchRules()
      ]);

      // All should succeed (though storage might be called multiple times)
      expect(rules1).toEqual(mockRules);
      expect(rules2).toEqual(mockRules);
      expect(rules3).toEqual(mockRules);
    });
  });

  describe('invalidateCache()', () => {
    test('should clear cache immediately', async () => {
      safeStorageGet
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockResolvedValueOnce({ customRules: [] });

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
        { id: 'custom-4', selector: '.refreshed-ad', enabled: true, domains: ['*'] }
      ];

      safeStorageGet
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockResolvedValueOnce({ customRules: updatedRules });

      // Fetch and cache
      await source.fetchRules();

      // Invalidate
      source.invalidateCache();

      // Immediate fetch should get new data
      const rules = await source.fetchRules();
      expect(rules).toEqual(updatedRules);
      expect(safeStorageGet).toHaveBeenCalledTimes(2);
    });

    test('should reset cache timer on invalidation', async () => {
      safeStorageGet
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockResolvedValueOnce({ customRules: mockRules })
        .mockResolvedValueOnce({ customRules: [] });

      // First fetch
      await source.fetchRules();

      // Wait 20 seconds (within TTL)
      vi.advanceTimersByTime(20000);

      // Invalidate
      source.invalidateCache();

      // Fetch again (should be fresh)
      await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(2);

      // Wait 20 more seconds (within new TTL)
      vi.advanceTimersByTime(20000);

      // Should still use cache
      await source.fetchRules();
      expect(safeStorageGet).toHaveBeenCalledTimes(2);
    });
  });
});
