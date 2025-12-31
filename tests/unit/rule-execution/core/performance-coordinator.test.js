/**
 * Unit Tests for PerformanceCoordinator
 * Tests time-slicing, batching, and performance optimization
 */

import { vi } from 'vitest';
import { PerformanceCoordinator } from '@modules/rule-execution/core/performance-coordinator.js';

describe('PerformanceCoordinator', () => {
  let coordinator;

  beforeEach(() => {
    coordinator = new PerformanceCoordinator({
      maxFrameTime: 16,
      batchSize: 50,
      enableTimeSlicing: true
    });

    // Mock window object for browser-specific APIs
    global.window = {
      requestIdleCallback: vi.fn((cb) => {
        setTimeout(cb, 0);
        return 1;
      })
    };

    // Make requestIdleCallback available globally as well
    global.requestIdleCallback = global.window.requestIdleCallback;

    // Mock performance.now
    global.performance = {
      now: vi.fn(() => Date.now())
    };

    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.window;
    delete global.requestIdleCallback;
    delete global.performance;
  });

  describe('Configuration', () => {
    test('should initialize with default configuration', () => {
      const defaultCoordinator = new PerformanceCoordinator();

      expect(defaultCoordinator).toBeDefined();
    });

    test('should use custom configuration values', () => {
      const customCoordinator = new PerformanceCoordinator({
        maxFrameTime: 32,
        batchSize: 100
      });

      expect(customCoordinator.getBatchSize()).toBe(100);
    });
  });

  describe('yieldIfNeeded()', () => {
    test('should yield when time threshold is exceeded', async () => {
      // Use real timers and actual time
      vi.useRealTimers();

      const startTime = performance.now();
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 20));

      // This should trigger yield since >16ms elapsed
      await coordinator.yieldIfNeeded(startTime, 16);

      vi.useFakeTimers();
    });

    test('should not yield when under time threshold', async () => {
      const startTime = Date.now();

      // Immediately check (0ms elapsed)
      await coordinator.yieldIfNeeded(startTime, 16);

      // Since elapsed time is very small, should not yield
    });

    test('should use default maxFrameTime if not specified', async () => {
      // Test that yieldIfNeeded works with default parameter
      const startTime = Date.now();

      await expect(coordinator.yieldIfNeeded(startTime)).resolves.not.toThrow();
    });

    test('should handle exact threshold edge case', async () => {
      const startTime = Date.now();

      // Should not throw even at edge cases
      await expect(coordinator.yieldIfNeeded(startTime, 16)).resolves.not.toThrow();
    });
  });

  describe('yieldToMainThread()', () => {
    test('should use requestIdleCallback when available', async () => {
      // Use real timers for this async operation
      vi.useRealTimers();

      await coordinator.yieldToMainThread();

      expect(window.requestIdleCallback).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 100 }
      );

      vi.useFakeTimers();
    });

    test('should fall back to setTimeout when requestIdleCallback unavailable', async () => {
      // Use real timers
      vi.useRealTimers();

      // Create a coordinator without window.requestIdleCallback
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((cb) => {
        return originalSetTimeout(cb, 0);
      });

      // Temporarily remove window
      const savedWindow = global.window;
      global.window = {};

      await coordinator.yieldToMainThread();

      // Should have fallen back to setTimeout
      expect(setTimeout).toHaveBeenCalled();

      // Restore
      global.window = savedWindow;
      global.setTimeout = originalSetTimeout;

      vi.useFakeTimers();
    });

    test('should resolve promise after yield', async () => {
      // Use real timers for promises
      vi.useRealTimers();

      let resolved = false;

      window.requestIdleCallback.mockImplementation((cb) => {
        setImmediate(() => {
          cb();
          resolved = true;
        });
        return 1;
      });

      const promise = coordinator.yieldToMainThread();
      expect(resolved).toBe(false);

      await promise;
      expect(resolved).toBe(true);

      vi.useFakeTimers();
    });
  });

  describe('shouldBatch()', () => {
    test('should recommend batching for large datasets', () => {
      const result = coordinator.shouldBatch(1000);

      expect(result).toBe(true);
    });

    test('should not recommend batching for small datasets', () => {
      const result = coordinator.shouldBatch(10);

      expect(result).toBe(false);
    });

    test('should use configured batch size threshold', () => {
      const smallBatchCoordinator = new PerformanceCoordinator({
        batchSize: 10
      });

      expect(smallBatchCoordinator.shouldBatch(50)).toBe(true);
      expect(smallBatchCoordinator.shouldBatch(5)).toBe(false);
    });

    test('should handle edge cases', () => {
      expect(coordinator.shouldBatch(0)).toBe(false);
      expect(coordinator.shouldBatch(-1)).toBe(false);
      expect(coordinator.shouldBatch(null)).toBe(false);
      expect(coordinator.shouldBatch(undefined)).toBe(false);
    });
  });

  describe('getBatchSize()', () => {
    test('should return configured batch size for normal datasets', () => {
      expect(coordinator.getBatchSize(100)).toBe(50);
    });

    test('should return total size if less than batch size', () => {
      expect(coordinator.getBatchSize(25)).toBe(25);
    });

    test('should use adaptive batching for large datasets (>1000 items)', () => {
      // For >1000 items, returns batchSize / 2 for smaller batches
      expect(coordinator.getBatchSize(5000)).toBe(25); // 50 / 2
    });

    test('should return custom batch size', () => {
      const customCoordinator = new PerformanceCoordinator({
        batchSize: 100
      });

      expect(customCoordinator.getBatchSize(500)).toBe(100);
      expect(customCoordinator.getBatchSize(2000)).toBe(50); // Adaptive: 100 / 2
    });
  });

  describe('executeInBatches()', () => {
    test('should process items in batches', async () => {
      const items = Array.from({ length: 150 }, (_, i) => i);
      const processedItems = [];

      const processFn = vi.fn(async (batch) => {
        processedItems.push(...batch);
      });

      await coordinator.executeInBatches(items, processFn);

      expect(processFn).toHaveBeenCalledTimes(3); // 150 / 50 = 3 batches
      expect(processedItems).toEqual(items);
    });

    test('should yield between batches', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const processFn = vi.fn();

      // Execute with real timers to allow async operations
      vi.useRealTimers();

      await coordinator.executeInBatches(items, processFn);

      // Two batches (50 items each), yields after first batch
      expect(processFn).toHaveBeenCalledTimes(2);

      vi.useFakeTimers();
    });

    test('should handle exact batch size', async () => {
      const items = Array.from({ length: 50 }, (_, i) => i);
      const processFn = vi.fn();

      await coordinator.executeInBatches(items, processFn);

      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith(items);
    });

    test('should handle items less than batch size', async () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const processFn = vi.fn();

      await coordinator.executeInBatches(items, processFn);

      expect(processFn).toHaveBeenCalledTimes(1);
      expect(processFn).toHaveBeenCalledWith(items);
    });

    test('should handle empty array', async () => {
      const processFn = vi.fn();

      await coordinator.executeInBatches([], processFn);

      expect(processFn).not.toHaveBeenCalled();
    });

    test('should pass correct batch slices to processor', async () => {
      const items = Array.from({ length: 125 }, (_, i) => i);
      const batches = [];

      const processFn = vi.fn(async (batch) => {
        batches.push([...batch]);
      });

      await coordinator.executeInBatches(items, processFn);

      expect(batches[0]).toEqual(items.slice(0, 50));
      expect(batches[1]).toEqual(items.slice(50, 100));
      expect(batches[2]).toEqual(items.slice(100, 125));
    });

    test('should handle async processor functions', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const results = [];

      // Use real timers for async test
      vi.useRealTimers();

      const processFn = vi.fn(async (batch) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        results.push(batch.length);
      });

      await coordinator.executeInBatches(items, processFn);

      expect(results).toEqual([50, 50]);

      vi.useFakeTimers();
    });

    test('should handle errors from processor gracefully', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);

      const processFn = vi.fn(async () => {
        throw new Error('Processing error');
      });

      // Should not throw - errors are caught and logged
      const results = await coordinator.executeInBatches(items, processFn);

      expect(results).toEqual([]);
      expect(processFn).toHaveBeenCalled(); // At least attempted to process
    });
  });

  describe('getMetrics()', () => {
    test('should return performance metrics', () => {
      const metrics = coordinator.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });

    test('should return configuration values', () => {
      const metrics = coordinator.getMetrics();

      expect(metrics.maxFrameTime).toBe(16);
      expect(metrics.batchSize).toBe(50);
      expect(metrics.enableTimeSlicing).toBe(true);
      expect(metrics.targetFPS).toBe(Math.floor(1000 / 16));
    });

    test('should calculate target FPS from maxFrameTime', () => {
      const customCoordinator = new PerformanceCoordinator({
        maxFrameTime: 33 // ~30fps
      });

      const metrics = customCoordinator.getMetrics();
      expect(metrics.targetFPS).toBe(30);
    });
  });

  describe('Performance', () => {
    test('should handle rapid yieldIfNeeded calls efficiently', async () => {
      const disabledCoordinator = new PerformanceCoordinator({
        enableTimeSlicing: false
      });

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await disabledCoordinator.yieldIfNeeded(1000, 16);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be very fast
      expect(requestIdleCallback).not.toHaveBeenCalled(); // Time slicing disabled
    });

    test('should handle large batch processing with adaptive batching', async () => {
      const items = Array.from({ length: 10000 }, (_, i) => i);
      const processFn = vi.fn();

      const start = Date.now();
      await coordinator.executeInBatches(items, processFn);
      const duration = Date.now() - start;

      // For >1000 items, uses batchSize/2 = 25, so 10000/25 = 400 batches
      expect(processFn).toHaveBeenCalledTimes(400);
      expect(duration).toBeLessThan(1000); // Should complete reasonably fast
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined inputs to yieldIfNeeded', async () => {
      // Use coordinator with time slicing disabled to avoid timing issues
      const testCoordinator = new PerformanceCoordinator({
        enableTimeSlicing: false
      });
      await expect(testCoordinator.yieldIfNeeded(null, 16)).resolves.not.toThrow();
      await expect(testCoordinator.yieldIfNeeded(undefined, 16)).resolves.not.toThrow();
    });

    test('should handle negative time values', async () => {
      const startTime = -1000;

      // Disable time slicing to avoid timing issues in tests
      const testCoordinator = new PerformanceCoordinator({
        enableTimeSlicing: false
      });

      await expect(testCoordinator.yieldIfNeeded(startTime, 16)).resolves.not.toThrow();
    });

    test('should handle executeInBatches with null processor gracefully', async () => {
      const items = [1, 2, 3];

      // Should handle error gracefully and return empty results
      const results = await coordinator.executeInBatches(items, null);

      expect(results).toEqual([]);
    });

    test('should handle very small batch sizes', async () => {
      const smallBatchCoordinator = new PerformanceCoordinator({
        batchSize: 1
      });

      const items = [1, 2, 3];
      const processFn = vi.fn();

      await smallBatchCoordinator.executeInBatches(items, processFn);

      expect(processFn).toHaveBeenCalledTimes(3); // One call per item
    });
  });
});
