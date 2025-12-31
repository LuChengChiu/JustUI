/**
 * Unit Tests for BudgetCoordinator
 * Tests priority-based budget allocation and 30,000 rule limit enforcement
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { BudgetCoordinator } from '@modules/network-blocking/core/budget-coordinator.js';

// Mock source helper
const createMockSource = (name, idStart, idEnd) => ({
  getName: () => name,
  getRuleIdRange: () => ({ start: idStart, end: idEnd }),
  getUpdateType: () => 'dynamic'
});

describe('BudgetCoordinator', () => {
  let coordinator;

  beforeEach(() => {
    coordinator = new BudgetCoordinator(30000);
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default 30000 rule limit', () => {
      expect(coordinator.maxDynamicRules).toBe(30000);
      expect(coordinator.allocations).toBeInstanceOf(Map);
      expect(coordinator.allocations.size).toBe(0);
    });

    test('should accept custom rule limit', () => {
      const customCoordinator = new BudgetCoordinator(50000);
      expect(customCoordinator.maxDynamicRules).toBe(50000);
    });

    test('should initialize with empty allocations', () => {
      expect(coordinator.allocations.size).toBe(0);
    });
  });

  describe('allocateBudget()', () => {
    test('should allocate budget in priority order', () => {
      const source1 = createMockSource('Custom Patterns', 60000, 64999);
      const source2 = createMockSource('Default Blocks', 50000, 50999);

      const sourceRequests = [
        { source: source1, ruleCount: 100 },
        { source: source2, ruleCount: 50 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Custom Patterns').allocated).toBe(100);
      expect(allocations.get('Custom Patterns').truncated).toBe(0);
      expect(allocations.get('Custom Patterns').priority).toBe(1);

      expect(allocations.get('Default Blocks').allocated).toBe(50);
      expect(allocations.get('Default Blocks').truncated).toBe(0);
      expect(allocations.get('Default Blocks').priority).toBe(2);
    });

    test('should enforce total budget limit', () => {
      const source1 = createMockSource('Source1', 1000, 20000); // Capacity: 19001
      const source2 = createMockSource('Source2', 20001, 40000); // Capacity: 20000

      const sourceRequests = [
        { source: source1, ruleCount: 20000 }, // Will get 19001 (capacity limit)
        { source: source2, ruleCount: 15000 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Source1').allocated).toBe(19001); // Capacity limited
      expect(allocations.get('Source2').allocated).toBe(10999); // Budget limited
      expect(allocations.get('Source2').truncated).toBe(4001);
    });

    test('should respect source ID range capacity', () => {
      const source = createMockSource('Small Range', 1000, 1999); // Only 1000 capacity

      const sourceRequests = [
        { source, ruleCount: 5000 } // Requesting more than capacity
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Small Range').allocated).toBe(1000);
      expect(allocations.get('Small Range').truncated).toBe(0); // Not truncated by budget
    });

    test('should truncate when rules exceed both capacity and budget', () => {
      const source = createMockSource('Limited', 1000, 5000); // 4001 capacity

      const coordinator = new BudgetCoordinator(2000); // Small budget
      const sourceRequests = [
        { source, ruleCount: 5000 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Limited').allocated).toBe(2000); // Budget limit
      expect(allocations.get('Limited').truncated).toBe(2001); // 4001 requested - 2000 allocated
    });

    test('should skip sources when budget exhausted', () => {
      const source1 = createMockSource('Source1', 1000, 31000);
      const source2 = createMockSource('Source2', 32000, 40000);
      const source3 = createMockSource('Source3', 41000, 50000);

      const sourceRequests = [
        { source: source1, ruleCount: 30000 },
        { source: source2, ruleCount: 5000 },
        { source: source3, ruleCount: 5000 }
      ];

      const consoleSpy = vi.spyOn(console, 'warn');
      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Source1').allocated).toBe(30000);
      expect(allocations.size).toBe(1); // Only Source1 allocated
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Budget exhausted')
      );
      consoleSpy.mockRestore();
    });

    test('should handle zero rule count', () => {
      const source = createMockSource('Empty', 1000, 2000);

      const sourceRequests = [
        { source, ruleCount: 0 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Empty').allocated).toBe(0);
      expect(allocations.get('Empty').truncated).toBe(0);
    });

    test('should handle empty source requests array', () => {
      const allocations = coordinator.allocateBudget([]);

      expect(allocations.size).toBe(0);
    });

    test('should log successful allocations', () => {
      const source = createMockSource('Test', 1000, 2000);
      const sourceRequests = [{ source, ruleCount: 500 }];

      const consoleSpy = vi.spyOn(console, 'log');
      coordinator.allocateBudget(sourceRequests);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Allocated 500 rules to Test')
      );
      consoleSpy.mockRestore();
    });

    test('should log truncation warnings', () => {
      const source = createMockSource('Test', 1000, 2000);
      const coordinator = new BudgetCoordinator(500); // Small budget

      const sourceRequests = [{ source, ruleCount: 800 }];

      const consoleSpy = vi.spyOn(console, 'warn');
      coordinator.allocateBudget(sourceRequests);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Budget exceeded for Test')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Allocated 500/800 rules, 300 truncated')
      );
      consoleSpy.mockRestore();
    });

    test('should store allocations internally', () => {
      const source = createMockSource('Test', 1000, 2000);
      const sourceRequests = [{ source, ruleCount: 100 }];

      coordinator.allocateBudget(sourceRequests);

      expect(coordinator.allocations.size).toBe(1);
      expect(coordinator.allocations.has('Test')).toBe(true);
    });

    test('should return allocations Map', () => {
      const source = createMockSource('Test', 1000, 2000);
      const sourceRequests = [{ source, ruleCount: 100 }];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations).toBeInstanceOf(Map);
      expect(allocations.size).toBe(1);
    });

    test('should include idRange in allocation', () => {
      const source = createMockSource('Test', 60000, 64999);
      const sourceRequests = [{ source, ruleCount: 100 }];

      const allocations = coordinator.allocateBudget(sourceRequests);
      const allocation = allocations.get('Test');

      expect(allocation.idRange).toEqual({ start: 60000, end: 64999 });
    });
  });

  describe('getStats()', () => {
    test('should return correct statistics', () => {
      const source1 = createMockSource('Source1', 1000, 2000);
      const source2 = createMockSource('Source2', 3000, 4000);

      const sourceRequests = [
        { source: source1, ruleCount: 500 },
        { source: source2, ruleCount: 300 }
      ];

      coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(stats.totalAllocated).toBe(800);
      expect(stats.totalTruncated).toBe(0);
      expect(stats.budgetRemaining).toBe(29200);
      expect(stats.bySource['Source1']).toBeDefined();
      expect(stats.bySource['Source2']).toBeDefined();
    });

    test('should calculate truncated rules correctly', () => {
      const source1 = createMockSource('Source1', 1000, 20000); // Capacity: 19001
      const source2 = createMockSource('Source2', 21000, 40000); // Capacity: 19001

      const coordinator = new BudgetCoordinator(25000);
      const sourceRequests = [
        { source: source1, ruleCount: 20000 }, // Will get 19001
        { source: source2, ruleCount: 10000 }  // Will get 5999
      ];

      coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(stats.totalAllocated).toBe(25000);
      expect(stats.totalTruncated).toBe(4001); // Source2 truncated by 4001
      expect(stats.budgetRemaining).toBe(0);
    });

    test('should return empty stats before allocation', () => {
      const stats = coordinator.getStats();

      expect(stats.totalAllocated).toBe(0);
      expect(stats.totalTruncated).toBe(0);
      expect(stats.budgetRemaining).toBe(30000);
      expect(Object.keys(stats.bySource)).toHaveLength(0);
    });

    test('should include per-source breakdown', () => {
      const source1 = createMockSource('Custom', 60000, 64999);
      const source2 = createMockSource('Default', 50000, 50999);

      const sourceRequests = [
        { source: source1, ruleCount: 150 },
        { source: source2, ruleCount: 71 }
      ];

      coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(stats.bySource['Custom']).toMatchObject({
        allocated: 150,
        truncated: 0,
        priority: 1,
        idRange: { start: 60000, end: 64999 }
      });

      expect(stats.bySource['Default']).toMatchObject({
        allocated: 71,
        truncated: 0,
        priority: 2,
        idRange: { start: 50000, end: 50999 }
      });
    });

    test('should maintain immutability of internal allocations', () => {
      const source = createMockSource('Test', 1000, 2000);
      const sourceRequests = [{ source, ruleCount: 100 }];

      coordinator.allocateBudget(sourceRequests);
      const stats1 = coordinator.getStats();
      const stats2 = coordinator.getStats();

      expect(stats1).not.toBe(stats2); // Different objects
      expect(stats1).toEqual(stats2); // Same content
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle typical production scenario', () => {
      const customPatterns = createMockSource('Custom User Patterns', 60000, 64999);
      const defaultBlocks = createMockSource('Default Block Requests', 50000, 50999);

      const sourceRequests = [
        { source: customPatterns, ruleCount: 150 },
        { source: defaultBlocks, ruleCount: 71 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(stats.totalAllocated).toBe(221);
      expect(stats.budgetRemaining).toBe(29779);
      expect(allocations.get('Custom User Patterns').priority).toBe(1);
      expect(allocations.get('Default Block Requests').priority).toBe(2);
    });

    test('should handle budget exhaustion scenario', () => {
      const source1 = createMockSource('High Priority', 1000, 10000); // Capacity: 9001
      const source2 = createMockSource('Medium Priority', 11000, 30000); // Capacity: 19001
      const source3 = createMockSource('Low Priority', 31000, 40000); // Capacity: 9001

      const sourceRequests = [
        { source: source1, ruleCount: 5000 },
        { source: source2, ruleCount: 25000 }, // Will get 19001 (capacity)
        { source: source3, ruleCount: 10000 }  // Will get 5999
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(allocations.get('High Priority').allocated).toBe(5000);
      expect(allocations.get('Medium Priority').allocated).toBe(19001); // Capacity limited
      expect(allocations.get('Low Priority').allocated).toBe(5999); // Budget limited
      expect(stats.totalAllocated).toBe(30000);
      expect(stats.budgetRemaining).toBe(0);
    });

    test('should handle maximum capacity scenario (5000 custom patterns)', () => {
      const customSource = createMockSource('Custom Patterns', 60000, 64999);

      const sourceRequests = [
        { source: customSource, ruleCount: 5000 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Custom Patterns').allocated).toBe(5000);
      expect(allocations.get('Custom Patterns').truncated).toBe(0);
    });

    test('should handle partial truncation across multiple sources', () => {
      const source1 = createMockSource('Source1', 1000, 16000);
      const source2 = createMockSource('Source2', 17000, 32000);
      const source3 = createMockSource('Source3', 33000, 48000);

      const sourceRequests = [
        { source: source1, ruleCount: 15000 },
        { source: source2, ruleCount: 10000 },
        { source: source3, ruleCount: 10000 }
      ];

      const allocations = coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(allocations.get('Source1').allocated).toBe(15000);
      expect(allocations.get('Source2').allocated).toBe(10000);
      expect(allocations.get('Source3').allocated).toBe(5000);
      expect(stats.totalTruncated).toBe(5000);
    });
  });

  describe('Edge cases', () => {
    test('should handle single source exceeding budget', () => {
      const source = createMockSource('Huge Source', 1000, 50000);
      const coordinator = new BudgetCoordinator(30000);

      const sourceRequests = [{ source, ruleCount: 40000 }];

      const allocations = coordinator.allocateBudget(sourceRequests);

      expect(allocations.get('Huge Source').allocated).toBe(30000);
      expect(allocations.get('Huge Source').truncated).toBe(10000);
    });

    test('should handle all sources under budget', () => {
      const sources = [
        createMockSource('S1', 1000, 2000),
        createMockSource('S2', 3000, 4000),
        createMockSource('S3', 5000, 6000)
      ];

      const sourceRequests = sources.map(source => ({
        source,
        ruleCount: 100
      }));

      const allocations = coordinator.allocateBudget(sourceRequests);
      const stats = coordinator.getStats();

      expect(stats.totalAllocated).toBe(300);
      expect(stats.totalTruncated).toBe(0);
      expect(stats.budgetRemaining).toBe(29700);
    });

    test('should handle duplicate allocateBudget calls', () => {
      const source = createMockSource('Test', 1000, 2000);
      const sourceRequests = [{ source, ruleCount: 100 }];

      coordinator.allocateBudget(sourceRequests);
      coordinator.allocateBudget(sourceRequests);

      // Second call should overwrite first
      expect(coordinator.allocations.size).toBe(1);
    });
  });
});
