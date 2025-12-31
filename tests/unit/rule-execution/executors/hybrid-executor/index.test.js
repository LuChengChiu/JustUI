/**
 * Unit Tests for HybridExecutor
 * Tests the main orchestrator for hybrid declarative-procedural engine
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Create mock implementations that persist across test runs
const mockInject = vi.fn().mockReturnValue(100);
const mockCleanup = vi.fn();
const mockIsInjected = vi.fn().mockReturnValue(true);
const mockBuild = vi.fn().mockReturnThis();
const mockClear = vi.fn();
const mockGetTokenCount = vi.fn().mockReturnValue(50);
const mockScan = vi.fn().mockReturnValue({ removed: 5, hidden: 10 });
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockSetStatsCallback = vi.fn();
const mockGetMutationStats = vi.fn().mockReturnValue({ mutations: 0 });
const mockWatcherIsActive = vi.fn().mockReturnValue(true);

// Mock sub-modules - hoisted automatically by Vitest
vi.mock('../../../../../src/scripts/modules/rule-execution/executors/hybrid-executor/style-injector.js', () => ({
  StyleInjector: vi.fn(() => ({
    inject: mockInject,
    cleanup: mockCleanup,
    isInjected: mockIsInjected
  }))
}));

vi.mock('../../../../../src/scripts/modules/rule-execution/executors/hybrid-executor/token-indexer.js', () => ({
  TokenIndexer: vi.fn(() => ({
    build: mockBuild,
    clear: mockClear,
    getTokenCount: mockGetTokenCount
  }))
}));

vi.mock('../../../../../src/scripts/modules/rule-execution/executors/hybrid-executor/dom-scanner.js', () => ({
  DomScanner: vi.fn(() => ({
    scan: mockScan
  }))
}));

vi.mock('../../../../../src/scripts/modules/rule-execution/executors/hybrid-executor/mutation-watcher.js', () => ({
  MutationWatcher: vi.fn(() => ({
    start: mockStart,
    stop: mockStop,
    setStatsCallback: mockSetStatsCallback,
    getStats: mockGetMutationStats,
    isActive: mockWatcherIsActive
  }))
}));

// Import HybridExecutor - mocks are already hoisted
import { HybridExecutor } from '@modules/rule-execution/executors/hybrid-executor/index.js';

describe('HybridExecutor', () => {
  let executor;

  beforeEach(() => {
    // Reset mock call counts
    vi.clearAllMocks();

    // Restore mock return values after clearAllMocks
    mockInject.mockReturnValue(100);
    mockIsInjected.mockReturnValue(true);
    mockBuild.mockReturnThis();
    mockGetTokenCount.mockReturnValue(50);
    mockScan.mockReturnValue({ removed: 5, hidden: 10 });
    mockGetMutationStats.mockReturnValue({ mutations: 0 });
    mockWatcherIsActive.mockReturnValue(true);

    // Mock document.body
    global.document = {
      body: {}
    };

    // Mock performance.now
    global.performance = {
      now: vi.fn().mockReturnValue(0)
    };

    executor = new HybridExecutor();
  });

  afterEach(() => {
    delete global.document;
    delete global.performance;
  });

  describe('Initialization', () => {
    test('should initialize with empty stats', () => {
      const stats = executor.getStats();

      expect(stats.removed).toBe(0);
      expect(stats.hidden).toBe(0);
      expect(stats.cssInjected).toBe(0);
      expect(stats.tokens).toBe(0);
    });

    test('should have styleInjector component', () => {
      expect(executor.styleInjector).toBeDefined();
    });

    test('should have tokenIndexer component', () => {
      expect(executor.tokenIndexer).toBeDefined();
    });
  });

  describe('execute()', () => {
    const mockRules = [
      { id: '1', selector: '.ad', enabled: true },
      { id: '2', selector: '#banner', enabled: true }
    ];

    test('should execute all phases', async () => {
      const result = await executor.execute(mockRules, 'example.com');

      expect(mockInject).toHaveBeenCalled();
      expect(mockBuild).toHaveBeenCalled();
      expect(result).toBeGreaterThan(0); // removed + hidden
    });

    test('should return 0 for empty rules', async () => {
      const result = await executor.execute([], 'example.com');

      expect(result).toBe(0);
      expect(mockInject).not.toHaveBeenCalled();
    });

    test('should return 0 for null rules', async () => {
      const result = await executor.execute(null, 'example.com');

      expect(result).toBe(0);
    });

    test('should filter out disabled rules', async () => {
      const rules = [
        { id: '1', selector: '.ad', enabled: true },
        { id: '2', selector: '#banner', enabled: false }
      ];

      await executor.execute(rules, 'example.com');

      // Should only inject enabled rules
      expect(mockInject).toHaveBeenCalledWith(['.ad']);
    });

    test('should filter out rules without selector', async () => {
      const rules = [
        { id: '1', selector: '.ad', enabled: true },
        { id: '2', enabled: true } // No selector
      ];

      await executor.execute(rules, 'example.com');

      expect(mockInject).toHaveBeenCalledWith(['.ad']);
    });

    test('should update stats after execution', async () => {
      await executor.execute(mockRules, 'example.com');

      const stats = executor.getStats();
      expect(stats.cssInjected).toBe(100);
      expect(stats.tokens).toBe(50);
      expect(stats.removed).toBe(5);
      expect(stats.hidden).toBe(10);
    });
  });

  describe('getStats()', () => {
    test('should return current stats', async () => {
      const mockRules = [{ id: '1', selector: '.ad', enabled: true }];
      await executor.execute(mockRules, 'example.com');

      const stats = executor.getStats();

      expect(stats).toHaveProperty('removed');
      expect(stats).toHaveProperty('hidden');
      expect(stats).toHaveProperty('cssInjected');
      expect(stats).toHaveProperty('tokens');
    });

    test('should include watcher stats when active', async () => {
      const mockRules = [{ id: '1', selector: '.ad', enabled: true }];
      await executor.execute(mockRules, 'example.com');

      const stats = executor.getStats();

      expect(stats).toHaveProperty('watcher');
    });
  });

  describe('cleanup()', () => {
    test('should call cleanup on all components', async () => {
      const mockRules = [{ id: '1', selector: '.ad', enabled: true }];
      await executor.execute(mockRules, 'example.com');

      executor.cleanup();

      expect(mockCleanup).toHaveBeenCalled();
      expect(mockClear).toHaveBeenCalled();
    });

    test('should stop mutation watcher', async () => {
      const mockRules = [{ id: '1', selector: '.ad', enabled: true }];
      await executor.execute(mockRules, 'example.com');

      executor.cleanup();

      expect(mockStop).toHaveBeenCalled();
      expect(executor.watcher).toBeNull();
    });

    test('should handle cleanup before execute', () => {
      expect(() => executor.cleanup()).not.toThrow();
    });
  });

  describe('setStatsCallback()', () => {
    test('should set callback for stat updates', () => {
      const callback = vi.fn();

      executor.setStatsCallback(callback);

      expect(executor.onStatsUpdate).toBe(callback);
    });
  });

  describe('isActive()', () => {
    test('should return true when style is injected', () => {
      expect(executor.isActive()).toBe(true);
    });
  });

  describe('rescan()', () => {
    test('should return empty result when no scanner', () => {
      const result = executor.rescan();

      expect(result).toEqual({ removed: 0, hidden: 0 });
    });

    test('should perform rescan after execute', async () => {
      const mockRules = [{ id: '1', selector: '.ad', enabled: true }];
      await executor.execute(mockRules, 'example.com');

      const result = executor.rescan();

      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('hidden');
    });
  });

  describe('getScanner()', () => {
    test('should return null before execute', () => {
      expect(executor.getScanner()).toBeNull();
    });

    test('should return scanner after execute', async () => {
      const mockRules = [{ id: '1', selector: '.ad', enabled: true }];
      await executor.execute(mockRules, 'example.com');

      expect(executor.getScanner()).toBeDefined();
    });
  });

  describe('getTokenIndexer()', () => {
    test('should return token indexer', () => {
      expect(executor.getTokenIndexer()).toBeDefined();
    });
  });
});
