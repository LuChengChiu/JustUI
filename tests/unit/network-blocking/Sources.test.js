/**
 * Unit Tests for Network Blocking Sources
 * Tests EasyListSource and DefaultBlockSource
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EasyListSource } from '@modules/network-blocking/sources/easylist-source.js';
import { DefaultBlockSource } from '@modules/network-blocking/sources/default-block-source.js';

// Mock global fetch
global.fetch = vi.fn();

describe('EasyListSource', () => {
  let source;
  const config = {
    name: 'Test EasyList',
    url: 'https://example.com/easylist.txt',
    idStart: 1000,
    idEnd: 2000,
    updateInterval: 10080
  };

  beforeEach(() => {
    source = new EasyListSource(
      config.name,
      config.url,
      config.idStart,
      config.idEnd,
      config.updateInterval
    );
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided values', () => {
      expect(source.name).toBe('Test EasyList');
      expect(source.url).toBe('https://example.com/easylist.txt');
      expect(source.idRange).toEqual({ start: 1000, end: 2000 });
      expect(source.updateInterval).toBe(10080);
    });

    test('should use default updateType as dynamic', () => {
      expect(source.updateType).toBe('dynamic');
    });

    test('should accept custom updateType', () => {
      const staticSource = new EasyListSource(
        'Static Test',
        'https://test.com/list.txt',
        1,
        1000,
        0,
        'static'
      );

      expect(staticSource.updateType).toBe('static');
    });
  });

  describe('fetchRules()', () => {
    test('should fetch rules as text', async () => {
      const mockText = '||example.com^\n||test.com^';
      fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(mockText)
      });

      const result = await source.fetchRules();

      expect(fetch).toHaveBeenCalledWith(config.url);
      expect(result).toBe(mockText);
    });

    test('should throw error on failed fetch', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(source.fetchRules()).rejects.toThrow(
        'Failed to fetch Test EasyList: 404'
      );
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      await expect(source.fetchRules()).rejects.toThrow('Network error');
    });

    test('should return large EasyList content', async () => {
      const largeContent = Array(10000)
        .fill('||ad-domain.com^')
        .join('\n');

      fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(largeContent)
      });

      const result = await source.fetchRules();

      expect(result.split('\n')).toHaveLength(10000);
    });
  });

  describe('getRuleIdRange()', () => {
    test('should return configured ID range', () => {
      const range = source.getRuleIdRange();

      expect(range).toEqual({ start: 1000, end: 2000 });
    });

    test('should return object with start and end properties', () => {
      const range = source.getRuleIdRange();

      expect(range).toHaveProperty('start');
      expect(range).toHaveProperty('end');
      expect(typeof range.start).toBe('number');
      expect(typeof range.end).toBe('number');
    });
  });

  describe('getUpdateInterval()', () => {
    test('should return configured update interval', () => {
      expect(source.getUpdateInterval()).toBe(10080);
    });

    test('should handle different intervals', () => {
      const dailySource = new EasyListSource(
        'Daily',
        'https://test.com',
        1,
        100,
        1440
      );

      expect(dailySource.getUpdateInterval()).toBe(1440);
    });
  });

  describe('getName()', () => {
    test('should return source name', () => {
      expect(source.getName()).toBe('Test EasyList');
    });
  });

  describe('getUpdateType()', () => {
    test('should return update type', () => {
      expect(source.getUpdateType()).toBe('dynamic');
    });

    test('should return static for static sources', () => {
      const staticSource = new EasyListSource(
        'Static',
        'https://test.com',
        1,
        1000,
        0,
        'static'
      );

      expect(staticSource.getUpdateType()).toBe('static');
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
});

describe('DefaultBlockSource', () => {
  let source;
  const config = {
    name: 'Default Blocks',
    url: 'https://example.com/blocks.json',
    idStart: 50000,
    idEnd: 50999,
    updateInterval: 1440
  };

  beforeEach(() => {
    source = new DefaultBlockSource(
      config.name,
      config.url,
      config.idStart,
      config.idEnd,
      config.updateInterval
    );
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided values', () => {
      expect(source.name).toBe('Default Blocks');
      expect(source.url).toBe('https://example.com/blocks.json');
      expect(source.idRange).toEqual({ start: 50000, end: 50999 });
      expect(source.updateInterval).toBe(1440);
    });
  });

  describe('fetchRules()', () => {
    test('should fetch rules as JSON', async () => {
      const mockJson = [
        { id: 'uBO_001', trigger: 'doubleclick.net', severity: 'high' },
        { id: 'uBO_002', trigger: 'tracker.io', severity: 'medium' }
      ];

      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockJson)
      });

      const result = await source.fetchRules();

      expect(fetch).toHaveBeenCalledWith(config.url);
      expect(result).toEqual(mockJson);
    });

    test('should throw error on failed fetch', async () => {
      // Mock both GitHub fetch (fails) and bundled file fetch (also fails)
      fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      // With fallback logic, error message includes both GitHub and bundled file failures
      await expect(source.fetchRules()).rejects.toThrow(
        'Failed to fetch Default Blocks from both GitHub and bundled file'
      );
    });

    test('should handle JSON parse errors and fallback to bundled file', async () => {
      // First call (GitHub) succeeds but JSON parse fails
      // Second call (bundled file) succeeds
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue([{ id: 'test' }])
        });

      // Should fallback to bundled file successfully
      const result = await source.fetchRules();
      expect(result).toEqual([{ id: 'test' }]);
    });

    test('should handle empty JSON array', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([])
      });

      const result = await source.fetchRules();

      expect(result).toEqual([]);
    });

    test('should preserve complex rule structures', async () => {
      const mockJson = [
        {
          id: 'uBO_003',
          trigger: '.*\\.malware\\.com',
          isRegex: true,
          severity: 'critical',
          resourceTypes: ['main_frame', 'sub_frame'],
          metadata: { source: 'user-custom' }
        }
      ];

      fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockJson)
      });

      const result = await source.fetchRules();

      expect(result[0]).toMatchObject(mockJson[0]);
      expect(result[0].metadata).toBeDefined();
    });
  });

  describe('getRuleIdRange()', () => {
    test('should return configured ID range', () => {
      const range = source.getRuleIdRange();

      expect(range).toEqual({ start: 50000, end: 50999 });
    });
  });

  describe('getUpdateInterval()', () => {
    test('should return configured update interval', () => {
      expect(source.getUpdateInterval()).toBe(1440);
    });
  });

  describe('getName()', () => {
    test('should return source name', () => {
      expect(source.getName()).toBe('Default Blocks');
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
});

describe('Source Polymorphism', () => {
  test('EasyListSource and DefaultBlockSource should be substitutable', async () => {
    const easylistSource = new EasyListSource(
      'EasyList',
      'https://test.com/easylist.txt',
      1000,
      2000,
      10080
    );

    const defaultSource = new DefaultBlockSource(
      'Defaults',
      'https://test.com/defaults.json',
      50000,
      50999,
      1440
    );

    // Both should have same interface
    const sources = [easylistSource, defaultSource];

    sources.forEach(source => {
      expect(source.getName()).toBeDefined();
      expect(source.getRuleIdRange()).toHaveProperty('start');
      expect(source.getRuleIdRange()).toHaveProperty('end');
      expect(typeof source.getUpdateInterval()).toBe('number');
      expect(source.getUpdateType()).toBeDefined();
    });
  });
});
