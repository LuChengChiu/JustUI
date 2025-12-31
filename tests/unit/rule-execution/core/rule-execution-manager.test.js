/**
 * Unit Tests for RuleExecutionManager
 * Tests orchestration, source coordination, and statistics tracking
 */

import { vi } from 'vitest';
import { RuleExecutionManager } from '@modules/rule-execution/core/rule-execution-manager.js';

// Mock chromeApiSafe
vi.mock('../../../../src/scripts/utils/chromeApiSafe.js', () => ({
  safeStorageGet: vi.fn()
}));

import { safeStorageGet } from '@script-utils/chromeApiSafe.js';

describe('RuleExecutionManager', () => {
  let manager;
  let mockSources;
  let mockExecutors;
  let mockParsers;
  let mockCoordinator;

  const mockRules = [
    { id: '1', selector: '.ad', enabled: true, domains: ['*'] }
  ];

  beforeEach(() => {
    // Create mock components
    mockSources = new Map([
      ['default', {
        fetchRules: vi.fn().mockResolvedValue(mockRules),
        getExecutorType: vi.fn().mockReturnValue('selector'),
        getName: vi.fn().mockReturnValue('Default Rules'),
        invalidateCache: vi.fn()
      }],
      ['custom', {
        fetchRules: vi.fn().mockResolvedValue(mockRules),
        getExecutorType: vi.fn().mockReturnValue('selector'),
        getName: vi.fn().mockReturnValue('Custom Rules'),
        invalidateCache: vi.fn()
      }]
    ]);

    mockExecutors = new Map([
      ['selector', {
        execute: vi.fn().mockResolvedValue(5),
        cleanup: vi.fn()
      }]
    ]);

    mockParsers = new Map([
      ['selector', {
        parse: vi.fn((rules) => Promise.resolve(rules))
      }]
    ]);

    mockCoordinator = {
      yieldIfNeeded: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue({ yieldsPerformed: 0 })
    };

    manager = new RuleExecutionManager(mockSources, mockExecutors, mockParsers, mockCoordinator);

    // Mock safeStorageGet for isSourceEnabled
    safeStorageGet.mockResolvedValue({
      defaultRulesEnabled: true,
      customRulesEnabled: true
    });

    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with sources, executors, parsers, and coordinator', () => {
      expect(manager.sources).toBe(mockSources);
      expect(manager.executors).toBe(mockExecutors);
      expect(manager.parsers).toBe(mockParsers);
      expect(manager.performanceCoordinator).toBe(mockCoordinator);
    });

    test('should initialize with empty statistics', () => {
      const stats = manager.getStatistics();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.totalRemoved).toBe(0);
      expect(stats.lastExecution).toBeNull();
    });
  });

  describe('executeAllRules()', () => {
    test('should execute all enabled sources', async () => {
      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default', 'custom']
      });

      expect(mockSources.get('default').fetchRules).toHaveBeenCalled();
      expect(mockSources.get('custom').fetchRules).toHaveBeenCalled();
      expect(results.defaultRulesRemoved).toBe(5);
      expect(results.customRulesRemoved).toBe(5);
    });

    test('should return aggregated results', async () => {
      mockExecutors.get('selector').execute
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(7);

      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default', 'custom']
      });

      expect(results).toMatchObject({
        defaultRulesRemoved: 3,
        customRulesRemoved: 7,
        executionTimeMs: expect.any(Number),
        errors: []
      });
    });

    test('should skip disabled sources', async () => {
      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default'] // Only default enabled
      });

      expect(mockSources.get('default').fetchRules).toHaveBeenCalled();
      expect(mockSources.get('custom').fetchRules).not.toHaveBeenCalled();
      expect(results.customRulesRemoved).toBe(0);
    });

    test('should handle empty enabled sources', async () => {
      const results = await manager.executeAllRules('example.com', {
        enabledSources: []
      });

      expect(mockSources.get('default').fetchRules).not.toHaveBeenCalled();
      expect(results.defaultRulesRemoved).toBe(0);
      expect(results.customRulesRemoved).toBe(0);
    });

    test('should yield between sources when time-slicing enabled', async () => {
      await manager.executeAllRules('example.com', {
        enabledSources: ['default', 'custom'],
        timeSlicing: true,
        maxExecutionTime: 16
      });

      expect(mockCoordinator.yieldIfNeeded).toHaveBeenCalled();
    });

    test('should not yield when time-slicing disabled', async () => {
      await manager.executeAllRules('example.com', {
        enabledSources: ['default', 'custom'],
        timeSlicing: false
      });

      expect(mockCoordinator.yieldIfNeeded).not.toHaveBeenCalled();
    });

    test('should update global statistics', async () => {
      await manager.executeAllRules('example.com', {
        enabledSources: ['default']
      });

      const stats = manager.getStatistics();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.totalRemoved).toBeGreaterThan(0);
      expect(stats.lastExecution).not.toBeNull();
    });

    test('should track execution time', async () => {
      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default']
      });

      expect(results.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof results.executionTimeMs).toBe('number');
    });
  });

  describe('executeSource()', () => {
    test('should coordinate fetch → parse → execute pipeline', async () => {
      const removed = await manager.executeSource('default', 'example.com');

      expect(mockSources.get('default').fetchRules).toHaveBeenCalled();
      expect(mockParsers.get('selector').parse).toHaveBeenCalledWith(mockRules);
      expect(mockExecutors.get('selector').execute).toHaveBeenCalledWith(
        mockRules,
        'example.com',
        {}
      );
      expect(removed).toBe(5);
    });

    test('should throw error for unknown source', async () => {
      await expect(
        manager.executeSource('unknown', 'example.com')
      ).rejects.toThrow('Source "unknown" not found');
    });

    test('should check if source is enabled', async () => {
      safeStorageGet.mockResolvedValue({ defaultRulesEnabled: false });

      const removed = await manager.executeSource('default', 'example.com');

      expect(removed).toBe(0);
      expect(mockSources.get('default').fetchRules).not.toHaveBeenCalled();
    });

    test('should return 0 when source returns no rules', async () => {
      mockSources.get('default').fetchRules.mockResolvedValue([]);

      const removed = await manager.executeSource('default', 'example.com');

      expect(removed).toBe(0);
    });

    test('should return 0 when parser returns no valid rules', async () => {
      mockParsers.get('selector').parse.mockResolvedValue([]);

      const removed = await manager.executeSource('default', 'example.com');

      expect(removed).toBe(0);
      expect(mockExecutors.get('selector').execute).not.toHaveBeenCalled();
    });

    test('should throw error for missing parser', async () => {
      mockSources.get('default').getExecutorType.mockReturnValue('unknown-type');

      // Parser is checked before executor in the implementation
      await expect(
        manager.executeSource('default', 'example.com')
      ).rejects.toThrow('Parser for type "unknown-type" not found');
    });

    test('should throw error for missing executor', async () => {
      mockSources.get('default').getExecutorType.mockReturnValue('unknown-type');

      // Add parser so we can reach executor check
      mockParsers.set('unknown-type', {
        parse: vi.fn((rules) => Promise.resolve(rules))
      });

      await expect(
        manager.executeSource('default', 'example.com')
      ).rejects.toThrow('Executor for type "unknown-type" not found');
    });

    test('should pass execution options to executor', async () => {
      const options = { timeSlicing: true, maxExecutionTime: 20 };

      await manager.executeSource('default', 'example.com', options);

      expect(mockExecutors.get('selector').execute).toHaveBeenCalledWith(
        mockRules,
        'example.com',
        options
      );
    });
  });

  describe('isSourceEnabled()', () => {
    test('should check storage for default rules', async () => {
      safeStorageGet.mockResolvedValue({ defaultRulesEnabled: true });

      const enabled = await manager.isSourceEnabled('default');

      expect(safeStorageGet).toHaveBeenCalledWith(['defaultRulesEnabled']);
      expect(enabled).toBe(true);
    });

    test('should check storage for custom rules', async () => {
      safeStorageGet.mockResolvedValue({ customRulesEnabled: false });

      const enabled = await manager.isSourceEnabled('custom');

      expect(safeStorageGet).toHaveBeenCalledWith(['customRulesEnabled']);
      expect(enabled).toBe(false);
    });

    test('should check storage for easylist', async () => {
      safeStorageGet.mockResolvedValue({ easylistEnabled: true });

      const enabled = await manager.isSourceEnabled('easylist');

      expect(safeStorageGet).toHaveBeenCalledWith(['easylistEnabled']);
      expect(enabled).toBe(true);
    });

    test('should default to true if not set in storage', async () => {
      safeStorageGet.mockResolvedValue({});

      const enabled = await manager.isSourceEnabled('default');

      expect(enabled).toBe(true);
    });

    test('should default to true for unknown sources', async () => {
      const enabled = await manager.isSourceEnabled('unknown-source');

      expect(enabled).toBe(true);
    });

    test('should handle storage errors gracefully', async () => {
      safeStorageGet.mockRejectedValue(new Error('Storage error'));

      const enabled = await manager.isSourceEnabled('default');

      expect(enabled).toBe(true); // Fail open
    });
  });

  describe('Error Handling', () => {
    test('should continue with other sources on error', async () => {
      mockSources.get('default').fetchRules.mockRejectedValue(new Error('Fetch error'));
      mockExecutors.get('selector').execute.mockResolvedValue(3);

      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default', 'custom']
      });

      expect(results.defaultRulesRemoved).toBe(0);
      expect(results.customRulesRemoved).toBe(3);
      expect(results.errors.length).toBe(1);
    });

    test('should populate errors array with source name and message', async () => {
      mockSources.get('default').fetchRules.mockRejectedValue(new Error('Test error'));

      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default']
      });

      expect(results.errors).toEqual([
        { source: 'default', error: 'Test error' }
      ]);
    });

    test('should handle multiple source errors', async () => {
      mockSources.get('default').fetchRules.mockRejectedValue(new Error('Error 1'));
      mockSources.get('custom').fetchRules.mockRejectedValue(new Error('Error 2'));

      const results = await manager.executeAllRules('example.com', {
        enabledSources: ['default', 'custom']
      });

      expect(results.errors.length).toBe(2);
      expect(results.errors[0].source).toBe('default');
      expect(results.errors[1].source).toBe('custom');
    });
  });

  describe('Statistics Tracking', () => {
    test('should track per-source statistics', async () => {
      mockExecutors.get('selector').execute.mockResolvedValue(10);

      await manager.executeAllRules('example.com', {
        enabledSources: ['default']
      });

      const stats = manager.getStatistics();

      expect(stats.bySource.default).toMatchObject({
        executions: 1,
        totalRemoved: 10,
        lastExecution: expect.any(Number)
      });
    });

    test('should accumulate statistics across multiple executions', async () => {
      mockExecutors.get('selector').execute.mockResolvedValue(5);

      await manager.executeAllRules('example.com', {
        enabledSources: ['default']
      });

      mockExecutors.get('selector').execute.mockResolvedValue(3);

      await manager.executeAllRules('example.com', {
        enabledSources: ['default']
      });

      const stats = manager.getStatistics();

      expect(stats.bySource.default.executions).toBe(2);
      expect(stats.bySource.default.totalRemoved).toBe(8); // 5 + 3
    });

    test('should include performance metrics in statistics', async () => {
      const stats = manager.getStatistics();

      expect(stats.performanceMetrics).toBeDefined();
    });
  });

  describe('updateSource()', () => {
    test('should invalidate cache and fetch rules', async () => {
      await manager.updateSource('default');

      expect(mockSources.get('default').invalidateCache).toHaveBeenCalled();
      expect(mockSources.get('default').fetchRules).toHaveBeenCalled();
    });

    test('should throw error for unknown source', async () => {
      await expect(
        manager.updateSource('unknown')
      ).rejects.toThrow('Source "unknown" not found');
    });

    test('should handle sources without invalidateCache method', async () => {
      const sourceWithoutInvalidate = {
        fetchRules: vi.fn().mockResolvedValue([]),
        getExecutorType: vi.fn(),
        getName: vi.fn()
      };

      mockSources.set('test', sourceWithoutInvalidate);

      await expect(
        manager.updateSource('test')
      ).resolves.not.toThrow();

      expect(sourceWithoutInvalidate.fetchRules).toHaveBeenCalled();
    });
  });

  describe('getResultKey()', () => {
    test('should map default to defaultRulesRemoved', () => {
      expect(manager.getResultKey('default')).toBe('defaultRulesRemoved');
    });

    test('should map custom to customRulesRemoved', () => {
      expect(manager.getResultKey('custom')).toBe('customRulesRemoved');
    });

    test('should map easylist to easylistRulesRemoved', () => {
      expect(manager.getResultKey('easylist')).toBe('easylistRulesRemoved');
    });

    test('should return null for unknown sources', () => {
      expect(manager.getResultKey('unknown')).toBeNull();
    });
  });

  describe('cleanup()', () => {
    test('should call cleanup on executors', () => {
      manager.cleanup();

      expect(mockExecutors.get('selector').cleanup).toHaveBeenCalled();
    });

    test('should reset statistics', () => {
      manager.stats.totalExecutions = 10;
      manager.stats.totalRemoved = 100;

      manager.cleanup();

      const stats = manager.getStatistics();
      expect(stats.totalExecutions).toBe(0);
      expect(stats.totalRemoved).toBe(0);
      expect(stats.lastExecution).toBeNull();
    });

    test('should handle executors without cleanup method', () => {
      mockExecutors.get('selector').cleanup = undefined;

      expect(() => manager.cleanup()).not.toThrow();
    });

    test('should handle cleanup', () => {
      // Cleanup should call executor cleanup methods
      manager.cleanup();

      expect(mockExecutors.get('selector').cleanup).toHaveBeenCalled();

      // Reset stats should work
      const stats = manager.getStatistics();
      expect(stats.totalExecutions).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null domain', async () => {
      const results = await manager.executeAllRules(null, {
        enabledSources: ['default']
      });

      expect(results.defaultRulesRemoved).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty domain', async () => {
      const results = await manager.executeAllRules('', {
        enabledSources: ['default']
      });

      expect(results.defaultRulesRemoved).toBeGreaterThanOrEqual(0);
    });

    test('should handle missing options', async () => {
      const results = await manager.executeAllRules('example.com');

      expect(results).toBeDefined();
      expect(results.errors).toBeDefined();
    });

    test('should use default values for missing option properties', async () => {
      const results = await manager.executeAllRules('example.com', {});

      expect(results.defaultRulesRemoved).toBeGreaterThanOrEqual(0);
      expect(results.customRulesRemoved).toBeGreaterThanOrEqual(0);
    });
  });
});
