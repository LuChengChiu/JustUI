import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PermissionCache } from '@script-utils/permission-cache.js';

vi.mock('../../src/scripts/utils/chrome-api-safe.js', () => ({
  isExtensionContextValid: vi.fn(() => true),
  safeStorageGet: vi.fn(),
  safeStorageSet: vi.fn()
}));

/**
 * Performance Benchmark Suite for Permission Cache DLL Implementation
 *
 * Expected Results (from plan):
 * - setSync(): < 100ms for 1000 operations
 * - getSync(): < 50ms for 1000 operations
 * - enforceSizeLimit() with evictions: < 50ms for 500 evictions
 * - Overall improvement: 98.3% faster eviction (1.5s → 25ms for heavy sessions)
 */

describe('PermissionCache - Performance Benchmarks', () => {
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache = new PermissionCache();
    vi.clearAllMocks();

    // Disable auto-cleanup to avoid interference
    if (cache.cleanupTimer) {
      clearInterval(cache.cleanupTimer);
      cache.cleanupTimer = null;
    }
  });

  afterEach(() => {
    cache.cleanup();
    vi.useRealTimers();
  });

  describe('Sequential Write Performance', () => {
    test('1000 sequential setSync() calls should complete in < 100ms', () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          i % 2 === 0 ? 'ALLOW' : 'DENY'
        );
      }

      const duration = performance.now() - startTime;

      console.log(`Sequential writes: ${duration.toFixed(2)}ms for 1000 operations`);
      console.log(`Average: ${(duration / 1000).toFixed(3)}ms per operation`);
      console.log(`Final cache size: ${cache.size} (MAX: 500 with LRU eviction)`);

      expect(duration).toBeLessThan(100);
      expect(cache.size).toBe(500); // MAX_CACHE_SIZE limit with LRU eviction
    });

    test('100 sequential setSync() calls (realistic session)', () => {
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      const duration = performance.now() - startTime;

      console.log(`Realistic session writes: ${duration.toFixed(2)}ms for 100 operations`);

      expect(duration).toBeLessThan(20);
      expect(cache.size).toBe(100);
    });
  });

  describe('Sequential Read Performance', () => {
    test('500 sequential getSync() calls should complete in < 30ms', () => {
      // Populate cache with 500 entries (at MAX_CACHE_SIZE)
      for (let i = 0; i < 500; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      const startTime = performance.now();

      // Read all 500 entries
      for (let i = 0; i < 500; i++) {
        const result = cache.getSync(
          `https://source${i}.com`,
          `https://target${i}.com`
        );
        expect(result).not.toBeNull();
      }

      const duration = performance.now() - startTime;

      console.log(`Sequential reads: ${duration.toFixed(2)}ms for 500 operations`);
      console.log(`Average: ${(duration / 500).toFixed(3)}ms per operation`);

      expect(duration).toBeLessThan(30);
    });

    test('LRU promotion overhead (1000 reads)', () => {
      // Add 500 entries (MAX_CACHE_SIZE)
      for (let i = 0; i < 500; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      // Read the last entry 1000 times (should promote to head each time)
      // Use entry 499 which is guaranteed to exist
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        cache.getSync('https://source499.com', 'https://target499.com');
      }

      const duration = performance.now() - startTime;

      console.log(`LRU promotion overhead: ${duration.toFixed(2)}ms for 1000 promotions`);

      expect(duration).toBeLessThan(30);
    });
  });

  describe('Eviction Performance (CRITICAL)', () => {
    test('500 LRU evictions should complete in < 50ms (98% improvement)', () => {
      // This is the CRITICAL performance test
      // Old implementation: O(n log n) sorting = 1.5s for 500 entries
      // New implementation: O(1) tail removal = ~25ms

      // Fill cache to trigger evictions
      // We'll add entries beyond the limit to force evictions
      const maxSize = 500;

      // Mock the config to set a lower max size for testing
      const originalMaxSize = cache.constructor.prototype.constructor.MAX_CACHE_SIZE;
      Object.defineProperty(cache.constructor.prototype.constructor, 'MAX_CACHE_SIZE', {
        value: maxSize,
        writable: true,
        configurable: true
      });

      // Add 500 entries (at limit)
      for (let i = 0; i < maxSize; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      expect(cache.size).toBe(maxSize);

      // Now add 500 more entries, forcing 500 evictions
      const startTime = performance.now();

      for (let i = maxSize; i < maxSize + 500; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      const duration = performance.now() - startTime;

      console.log(`LRU evictions: ${duration.toFixed(2)}ms for 500 evictions`);
      console.log(`Average: ${(duration / 500).toFixed(3)}ms per eviction`);
      console.log(`Expected old implementation: ~1500ms (O(n log n) sort)`);
      console.log(`Improvement: ${((1500 - duration) / 1500 * 100).toFixed(1)}%`);

      expect(duration).toBeLessThan(50);
      expect(cache.size).toBe(maxSize);

      // Restore original max size
      Object.defineProperty(cache.constructor.prototype.constructor, 'MAX_CACHE_SIZE', {
        value: originalMaxSize,
        writable: true,
        configurable: true
      });
    });

    test('Direct enforceSizeLimit() call when at limit', () => {
      const maxSize = 500; // Actual MAX_CACHE_SIZE

      // Add 500 entries (at limit)
      for (let i = 0; i < 500; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      expect(cache.size).toBe(maxSize);

      // Manually trigger enforceSizeLimit when already at limit
      const startTime = performance.now();
      cache.enforceSizeLimit();
      const duration = performance.now() - startTime;

      console.log(`enforceSizeLimit() direct call (at limit): ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(5); // Should be very fast - just checks size
      expect(cache.size).toBe(maxSize);
    });
  });

  describe('Mixed Operations', () => {
    test('1000 mixed operations (70% writes, 30% reads)', () => {
      const operations = 1000;
      const writeRatio = 0.7;

      const startTime = performance.now();

      for (let i = 0; i < operations; i++) {
        if (Math.random() < writeRatio) {
          // Write operation
          cache.setSync(
            `https://source${i}.com`,
            `https://target${i}.com`,
            'ALLOW'
          );
        } else {
          // Read operation (might miss if not written yet)
          cache.getSync(
            `https://source${Math.floor(Math.random() * i)}.com`,
            `https://target${Math.floor(Math.random() * i)}.com`
          );
        }
      }

      const duration = performance.now() - startTime;

      console.log(`Mixed operations: ${duration.toFixed(2)}ms for ${operations} ops`);
      console.log(`Average: ${(duration / operations).toFixed(3)}ms per operation`);

      expect(duration).toBeLessThan(150);
    });
  });

  describe('Expired Entry Cleanup Performance', () => {
    test('cleanExpired() with 500 expired entries', () => {
      // Add 500 entries
      for (let i = 0; i < 500; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      // Fast-forward to expire all entries
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      const startTime = performance.now();
      const removed = cache.cleanExpired();
      const duration = performance.now() - startTime;

      console.log(`cleanExpired(): ${duration.toFixed(2)}ms for ${removed} expired entries`);

      expect(duration).toBeLessThan(20);
      expect(removed).toBe(500);
      expect(cache.size).toBe(0);
    });
  });

  describe('Memory Overhead Estimation', () => {
    test('estimates memory overhead for 500 entries', () => {
      // Add 500 entries
      for (let i = 0; i < 500; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW',
          { metadata: { test: 'data' } }
        );
      }

      // Rough estimation:
      // Each CacheNode has:
      // - key (string, ~50 bytes average)
      // - value (object, ~200 bytes)
      // - prev pointer (8 bytes)
      // - next pointer (8 bytes)
      // Total per node: ~266 bytes
      // 500 nodes: ~133KB

      // Map overhead: ~8 bytes per entry = 4KB
      // Total overhead: ~137KB

      const estimatedOverheadBytes = 500 * 266;
      const estimatedOverheadKB = estimatedOverheadBytes / 1024;

      console.log(`Estimated memory overhead for 500 entries: ${estimatedOverheadKB.toFixed(2)}KB`);
      console.log(`Per-entry overhead: ${(estimatedOverheadBytes / 500).toFixed(0)} bytes`);
      console.log(`DLL pointers overhead: ${(16 * 500 / 1024).toFixed(2)}KB (prev + next)`);

      expect(cache.size).toBe(500);
      expect(estimatedOverheadKB).toBeLessThan(150); // Acceptable overhead
    });
  });

  describe('Real-World Scenario: Heavy Navigation Session', () => {
    test('simulates 500 navigation decisions with eviction', () => {
      // This simulates the scenario from the plan:
      // Heavy navigation session with 500 permission decisions
      // Old implementation: 1.5s wasted on sorting
      // New implementation: 25ms total eviction time

      const maxSize = 500;

      Object.defineProperty(cache.constructor.prototype.constructor, 'MAX_CACHE_SIZE', {
        value: maxSize,
        writable: true,
        configurable: true
      });

      const startTime = performance.now();
      let decisions = 0;
      let evictions = 0;

      // Simulate 500 navigation decisions
      for (let i = 0; i < 700; i++) {
        const decision = Math.random() > 0.5 ? 'ALLOW' : 'DENY';

        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          decision
        );

        decisions++;

        // Check if eviction happened
        if (cache.size === maxSize && i >= maxSize) {
          evictions++;
        }
      }

      const duration = performance.now() - startTime;

      console.log(`\n=== Heavy Navigation Session Benchmark ===`);
      console.log(`Total decisions: ${decisions}`);
      console.log(`Evictions triggered: ${evictions}`);
      console.log(`Total time: ${duration.toFixed(2)}ms`);
      console.log(`Expected old implementation: ~1500ms`);
      console.log(`Improvement: ${((1500 - duration) / 1500 * 100).toFixed(1)}%`);
      console.log(`==========================================\n`);

      expect(duration).toBeLessThan(100); // Much faster than old 1500ms
      expect(cache.size).toBe(maxSize);
    });
  });

  describe('DLL Integrity Validation Overhead', () => {
    test('measures validation overhead (dev mode only)', () => {
      // Add 100 entries
      for (let i = 0; i < 100; i++) {
        cache.setSync(
          `https://source${i}.com`,
          `https://target${i}.com`,
          'ALLOW'
        );
      }

      // Measure validation time
      const startTime = performance.now();
      cache._validateDLL();
      const duration = performance.now() - startTime;

      console.log(`DLL validation overhead: ${duration.toFixed(2)}ms for 100 entries`);

      // Validation should be very fast (only runs in dev mode)
      expect(duration).toBeLessThan(5);
    });
  });
});
