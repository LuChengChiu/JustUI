/**
 * Unit Tests for EasyListDomSource
 * Tests rule fetching, 7-day caching, and graceful degradation
 */

import { vi } from 'vitest';
import { EasyListDomSource } from '@modules/rule-execution/sources/easylist-dom-source.js';

// Mock chromeApiSafe
vi.mock('../../../../src/scripts/utils/chromeApiSafe.js', () => ({
  safeStorageGet: vi.fn(),
  safeStorageSet: vi.fn()
}));

import { safeStorageGet, safeStorageSet } from '@script-utils/chromeApiSafe.js';

// Mock fetch
global.fetch = vi.fn();

describe('EasyListDomSource', () => {
  let source;
  const mockRules = [
    '##.ad-banner',
    '###AD_Top',
    '##[class^="adDisplay"]'
  ];

  beforeEach(() => {
    source = new EasyListDomSource();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset memory cache
    source.memoryCachedRules = null;
    source.memoryCacheTime = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Properties', () => {
    test('should return correct source name', () => {
      expect(source.getName()).toBe('EasyList DOM Rules');
    });

    test('should return correct executor type (hybrid)', () => {
      expect(source.getExecutorType()).toBe('hybrid');
    });

    test('should return correct cache key', () => {
      expect(source.getCacheKey()).toBe('easylistDomRules');
    });

    test('should return correct update interval (7 days in minutes)', () => {
      expect(source.getUpdateInterval()).toBe(10080);
    });
  });

  describe('fetchRules()', () => {
    test('should fetch from network when cache is empty', async () => {
      safeStorageGet.mockResolvedValue({});
      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRules.join('\n'))
      });
      safeStorageSet.mockResolvedValue();

      const rules = await source.fetchRules();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('easylist_general_hide.txt')
      );
      expect(rules).toEqual(mockRules);
    });

    test('should use cached rules when cache is valid', async () => {
      const cached = {
        rules: mockRules,
        lastFetched: Date.now() - 1000, // 1 second ago
        version: '1.0'
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: cached });

      const rules = await source.fetchRules();

      expect(fetch).not.toHaveBeenCalled();
      expect(rules).toEqual(mockRules);
    });

    test('should fetch fresh rules when cache expires (7 days)', async () => {
      const expiredCache = {
        rules: ['##.old-rule'],
        lastFetched: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
        version: '1.0'
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: expiredCache });
      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRules.join('\n'))
      });
      safeStorageSet.mockResolvedValue();

      const rules = await source.fetchRules();

      expect(fetch).toHaveBeenCalled();
      expect(rules).toEqual(mockRules);
    });

    test('should use memory cache for subsequent calls', async () => {
      safeStorageGet.mockResolvedValue({});
      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRules.join('\n'))
      });
      safeStorageSet.mockResolvedValue();

      // First fetch - network call
      await source.fetchRules();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second fetch within memory cache TTL - should use memory cache
      const rules2 = await source.fetchRules();
      expect(fetch).toHaveBeenCalledTimes(1); // No additional fetch
      expect(rules2).toEqual(mockRules);
    });
  });

  describe('Cache Validation', () => {
    test('should invalidate cache with wrong version', async () => {
      const oldVersionCache = {
        rules: mockRules,
        lastFetched: Date.now() - 1000,
        version: '0.9' // Old version
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: oldVersionCache });
      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRules.join('\n'))
      });
      safeStorageSet.mockResolvedValue();

      await source.fetchRules();

      expect(fetch).toHaveBeenCalled(); // Should fetch fresh due to version mismatch
    });

    test('should invalidate cache with missing lastFetched', async () => {
      const invalidCache = {
        rules: mockRules,
        version: '1.0'
        // Missing lastFetched
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: invalidCache });
      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRules.join('\n'))
      });
      safeStorageSet.mockResolvedValue();

      await source.fetchRules();

      expect(fetch).toHaveBeenCalled();
    });

    test('should validate cache at boundary (exactly 7 days)', async () => {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const boundaryCache = {
        rules: mockRules,
        lastFetched: sevenDaysAgo,
        version: '1.0'
      };

      expect(source.isCacheValid(boundaryCache)).toBe(false);
    });

    test('should validate cache just under 7 days', async () => {
      const justUnder = Date.now() - (7 * 24 * 60 * 60 * 1000) + 1000;
      const validCache = {
        rules: mockRules,
        lastFetched: justUnder,
        version: '1.0'
      };

      expect(source.isCacheValid(validCache)).toBe(true);
    });
  });

  describe('Graceful Degradation', () => {
    test('should use expired cache on network failure', async () => {
      const expiredCache = {
        rules: mockRules,
        lastFetched: Date.now() - (8 * 24 * 60 * 60 * 1000), // Expired
        version: '1.0'
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: expiredCache });
      fetch.mockRejectedValue(new Error('Network error'));

      const rules = await source.fetchRules();

      expect(rules).toEqual(mockRules); // Should fallback to expired cache
    });

    test('should return empty array when both network and cache fail', async () => {
      safeStorageGet.mockResolvedValue({});
      fetch.mockRejectedValue(new Error('Network error'));

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });

    test('should handle fetch returning non-ok response', async () => {
      safeStorageGet.mockResolvedValue({});
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const rules = await source.fetchRules();

      expect(rules).toEqual([]);
    });
  });

  describe('invalidateCache()', () => {
    test('should clear memory cache', async () => {
      // First, populate memory cache
      source.memoryCachedRules = mockRules;
      source.memoryCacheTime = Date.now();

      source.invalidateCache();

      expect(source.memoryCachedRules).toBeNull();
      expect(source.memoryCacheTime).toBe(0);
    });
  });

  describe('forceRefresh()', () => {
    test('should fetch fresh rules regardless of cache', async () => {
      // Set up valid cache
      const validCache = {
        rules: ['##.old-rule'],
        lastFetched: Date.now() - 1000,
        version: '1.0'
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: validCache });
      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockRules.join('\n'))
      });
      safeStorageSet.mockResolvedValue();

      const rules = await source.forceRefresh();

      expect(fetch).toHaveBeenCalled();
      expect(rules).toEqual(mockRules);
    });

    test('should throw error on fetch failure', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      await expect(source.forceRefresh()).rejects.toThrow('Network error');
    });
  });

  describe('getCacheStatus()', () => {
    test('should return status for valid cache', async () => {
      const cached = {
        rules: mockRules,
        lastFetched: Date.now() - 1000,
        version: '1.0'
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: cached });

      const status = await source.getCacheStatus();

      expect(status.lastFetched).toBe(cached.lastFetched);
      expect(status.ruleCount).toBe(3);
      expect(status.isExpired).toBe(false);
    });

    test('should return status for expired cache', async () => {
      const cached = {
        rules: mockRules,
        lastFetched: Date.now() - (8 * 24 * 60 * 60 * 1000),
        version: '1.0'
      };
      safeStorageGet.mockResolvedValue({ easylistDomRules: cached });

      const status = await source.getCacheStatus();

      expect(status.isExpired).toBe(true);
    });

    test('should return status for no cache', async () => {
      safeStorageGet.mockResolvedValue({});

      const status = await source.getCacheStatus();

      expect(status.lastFetched).toBeNull();
      expect(status.ruleCount).toBe(0);
      expect(status.isExpired).toBe(true);
    });
  });
});
