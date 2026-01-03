/**
 * Unit Tests for CustomPatternSource
 * Tests custom pattern fetching from chrome.storage and conversion to DNR format
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { CustomPatternSource } from '@modules/network-blocking/sources/custom-pattern-source.js';

// Mock chrome.storage and runtime API
global.chrome = {
  storage: {
    sync: {
      get: vi.fn()
    }
  },
  runtime: {
    lastError: null
  }
};

describe('CustomPatternSource', () => {
  let source;
  const config = {
    name: 'Custom User Patterns',
    idStart: 60000,
    idEnd: 64999,
    updateInterval: 0
  };

  beforeEach(() => {
    source = new CustomPatternSource(
      config.name,
      config.idStart,
      config.idEnd,
      config.updateInterval
    );
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided values', () => {
      expect(source.name).toBe('Custom User Patterns');
      expect(source.idRange).toEqual({ start: 60000, end: 64999 });
      expect(source.updateInterval).toBe(0);
    });

    test('should default updateInterval to 0 (manual updates)', () => {
      const defaultSource = new CustomPatternSource('Test', 60000, 64999);
      expect(defaultSource.updateInterval).toBe(0);
    });
  });

  describe('fetchRules()', () => {
    test('should fetch patterns from chrome.storage.sync', async () => {
      const mockPatterns = ['ads.example.com', 'tracker.io'];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      expect(chrome.storage.sync.get).toHaveBeenCalledWith(['networkBlockPatterns']);
      expect(result).toHaveLength(2);
    });

    test('should convert string patterns to JSON rule format', async () => {
      const mockPatterns = ['malicious.com'];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      expect(result[0]).toMatchObject({
        id: 'custom_0',
        trigger: 'malicious.com',
        category: 'custom',
        severity: 'critical',
        description: 'User-defined custom blocking pattern',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script'],
        isRegex: false
      });
    });

    test('should assign sequential IDs to patterns', async () => {
      const mockPatterns = ['site1.com', 'site2.com', 'site3.com'];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      expect(result[0].id).toBe('custom_0');
      expect(result[1].id).toBe('custom_1');
      expect(result[2].id).toBe('custom_2');
    });

    test('should handle empty patterns array', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: []
      });

      const result = await source.fetchRules();

      expect(result).toEqual([]);
    });

    test('should handle missing networkBlockPatterns key', async () => {
      chrome.storage.sync.get.mockResolvedValue({});

      const result = await source.fetchRules();

      expect(result).toEqual([]);
    });

    test('should truncate patterns exceeding 5000 limit', async () => {
      const mockPatterns = Array(6000).fill('test.com');
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const consoleSpy = vi.spyOn(console, 'warn');
      const result = await source.fetchRules();

      expect(result).toHaveLength(5000);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NetworkBlocking:CustomPatternSource]'),
        expect.stringContaining('Custom patterns exceed capacity (6000/5000)'),
        expect.any(Object)
      );
      consoleSpy.mockRestore();
    });

    test('should handle exactly 5000 patterns without warning', async () => {
      const mockPatterns = Array(5000).fill('test.com');
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const consoleSpy = vi.spyOn(console, 'warn');
      const result = await source.fetchRules();

      expect(result).toHaveLength(5000);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should preserve all pattern strings correctly', async () => {
      const mockPatterns = [
        'simple.com',
        'with-dash.com',
        'subdomain.example.com',
        '*.wildcard.com'
      ];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      expect(result[0].trigger).toBe('simple.com');
      expect(result[1].trigger).toBe('with-dash.com');
      expect(result[2].trigger).toBe('subdomain.example.com');
      expect(result[3].trigger).toBe('*.wildcard.com');
    });

    test('should set critical severity for all patterns', async () => {
      const mockPatterns = ['test1.com', 'test2.com'];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      result.forEach(rule => {
        expect(rule.severity).toBe('critical');
      });
    });

    test('should include all required resource types', async () => {
      const mockPatterns = ['test.com'];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      expect(result[0].resourceTypes).toEqual([
        'main_frame',
        'sub_frame',
        'xmlhttprequest',
        'script'
      ]);
    });
  });

  describe('getRuleIdRange()', () => {
    test('should return configured ID range', () => {
      const range = source.getRuleIdRange();

      expect(range).toEqual({ start: 60000, end: 64999 });
    });

    test('should return object with start and end properties', () => {
      const range = source.getRuleIdRange();

      expect(range).toHaveProperty('start');
      expect(range).toHaveProperty('end');
      expect(typeof range.start).toBe('number');
      expect(typeof range.end).toBe('number');
    });

    test('should have capacity of 5000 IDs', () => {
      const range = source.getRuleIdRange();
      const capacity = range.end - range.start + 1;

      expect(capacity).toBe(5000);
    });
  });

  describe('getUpdateInterval()', () => {
    test('should return 0 for manual updates', () => {
      expect(source.getUpdateInterval()).toBe(0);
    });
  });

  describe('getName()', () => {
    test('should return source name', () => {
      expect(source.getName()).toBe('Custom User Patterns');
    });
  });

  describe('getUpdateType()', () => {
    test('should always return dynamic', () => {
      expect(source.getUpdateType()).toBe('dynamic');
    });
  });

  describe('IRuleSource interface compliance', () => {
    test('should implement all required methods', () => {
      expect(typeof source.fetchRules).toBe('function');
      expect(typeof source.getRuleIdRange).toBe('function');
      expect(typeof source.getUpdateInterval).toBe('function');
      expect(typeof source.getName).toBe('function');
      expect(typeof source.getUpdateType).toBe('function');
    });
  });

  describe('Integration scenarios', () => {
    test('should handle patterns with special characters', async () => {
      const mockPatterns = [
        'example.com/path?query=value',
        'site.com:8080',
        'https://secure.com'
      ];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const result = await source.fetchRules();

      expect(result).toHaveLength(3);
      expect(result[0].trigger).toBe('example.com/path?query=value');
      expect(result[1].trigger).toBe('site.com:8080');
      expect(result[2].trigger).toBe('https://secure.com');
    });

    test('should handle rapid successive fetches', async () => {
      const mockPatterns = ['test.com'];
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: mockPatterns
      });

      const [result1, result2, result3] = await Promise.all([
        source.fetchRules(),
        source.fetchRules(),
        source.fetchRules()
      ]);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(chrome.storage.sync.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error handling', () => {
    test('should handle chrome.storage errors gracefully', async () => {
      chrome.storage.sync.get.mockRejectedValue(new Error('Storage error'));

      await expect(source.fetchRules()).rejects.toThrow('Storage error');
    });

    test('should handle null patterns array', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        networkBlockPatterns: null
      });

      const result = await source.fetchRules();

      expect(result).toEqual([]);
    });
  });
});
