/**
 * Unit Tests for ElementRemover
 * Tests element removal, validation, cleanup, and statistics
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ElementRemover } from '@modules/element-remover.js';

describe('ElementRemover', () => {
  beforeEach(() => {
    // Reset state before each test
    ElementRemover.cleanup();
  });

  describe('REMOVAL_STRATEGIES', () => {
    test('should only have REMOVE strategy', () => {
      expect(ElementRemover.REMOVAL_STRATEGIES).toEqual({
        REMOVE: 'remove'
      });
    });
  });

  describe('CLEANUP_CONFIG', () => {
    test('should have documented configuration values', () => {
      expect(ElementRemover.CLEANUP_CONFIG.MAX_STATS_AGE_MS).toBe(300000); // 5 minutes
      expect(ElementRemover.CLEANUP_CONFIG.CLEANUP_CHECK_INTERVAL_MS).toBe(30000); // 30 seconds
    });
  });

  describe('validateStrategy()', () => {
    test('should allow undefined strategy', () => {
      expect(ElementRemover.validateStrategy(undefined)).toBe(true);
    });

    test('should allow null strategy', () => {
      expect(ElementRemover.validateStrategy(null)).toBe(true);
    });

    test('should allow REMOVE strategy', () => {
      expect(ElementRemover.validateStrategy('remove')).toBe(true);
    });

    test('should throw error for non-string strategy', () => {
      expect(() => {
        ElementRemover.validateStrategy(123);
      }).toThrow('ElementRemover: Strategy must be a string, got number');
    });

    test('should throw error for HIDE strategy', () => {
      expect(() => {
        ElementRemover.validateStrategy('hide');
      }).toThrow('ElementRemover: Unsupported removal strategy "hide". Only "remove" is supported.');
    });

    test('should throw error for NEUTRALIZE strategy', () => {
      expect(() => {
        ElementRemover.validateStrategy('neutralize');
      }).toThrow('ElementRemover: Unsupported removal strategy "neutralize". Only "remove" is supported.');
    });

    test('should throw error for unknown strategy', () => {
      expect(() => {
        ElementRemover.validateStrategy('unknown');
      }).toThrow('ElementRemover: Unsupported removal strategy "unknown". Only "remove" is supported.');
    });
  });

  describe('removeElement()', () => {
    test('should remove element and return true', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const result = ElementRemover.removeElement(element, 'test-rule');

      expect(result).toBe(true);
      expect(document.body.contains(element)).toBe(false);
      expect(ElementRemover.isProcessed(element)).toBe(true);
      expect(ElementRemover.removalStats.totalRemoved).toBe(1);
    });

    test('should return false for null element', () => {
      const result = ElementRemover.removeElement(null, 'test-rule');

      expect(result).toBe(false);
      expect(ElementRemover.removalStats.totalRemoved).toBe(0);
    });

    test('should return false for undefined element', () => {
      const result = ElementRemover.removeElement(undefined, 'test-rule');

      expect(result).toBe(false);
      expect(ElementRemover.removalStats.totalRemoved).toBe(0);
    });

    test('should return false for already-processed element', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      // First removal
      ElementRemover.removeElement(element, 'test-rule');

      // Second removal attempt (already processed)
      const result = ElementRemover.removeElement(element, 'test-rule');

      expect(result).toBe(false);
      expect(ElementRemover.removalStats.totalRemoved).toBe(1); // Should not increment
    });

    test('should throw error for invalid strategy', () => {
      const element = document.createElement('div');

      expect(() => {
        ElementRemover.removeElement(element, 'test-rule', 'hide');
      }).toThrow('ElementRemover: Unsupported removal strategy "hide"');
    });

    test('should accept REMOVE strategy explicitly', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      const result = ElementRemover.removeElement(
        element,
        'test-rule',
        ElementRemover.REMOVAL_STRATEGIES.REMOVE
      );

      expect(result).toBe(true);
      expect(document.body.contains(element)).toBe(false);
    });

    test('should increment totalRemoved stats', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');

      ElementRemover.removeElement(element1, 'rule-1');
      ElementRemover.removeElement(element2, 'rule-2');

      expect(ElementRemover.removalStats.totalRemoved).toBe(2);
    });

    test('should handle removal errors gracefully', () => {
      const element = document.createElement('div');
      // Mock element.remove() to throw error
      element.remove = () => {
        throw new Error('Mock removal error');
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = ElementRemover.removeElement(element, 'test-rule');

      expect(result).toBe(false);
      expect(ElementRemover.removalStats.totalRemoved).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ElementRemoval]'),
        'Error during element removal',
        expect.objectContaining({
          category: 'ElementRemoval',
          message: 'Error during element removal'
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('batchRemove()', () => {
    test('should remove multiple elements and return count', () => {
      const elements = [
        document.createElement('div'),
        document.createElement('div'),
        document.createElement('div')
      ];
      elements.forEach(el => document.body.appendChild(el));

      const removed = ElementRemover.batchRemove(elements, 'batch-rule');

      expect(removed).toBe(3);
      expect(ElementRemover.removalStats.totalRemoved).toBe(3);
      elements.forEach(el => {
        expect(document.body.contains(el)).toBe(false);
        expect(ElementRemover.isProcessed(el)).toBe(true);
      });
    });

    test('should throw error for invalid strategy', () => {
      const elements = [document.createElement('div')];

      expect(() => {
        ElementRemover.batchRemove(elements, 'batch-rule', 'hide');
      }).toThrow('ElementRemover: Unsupported removal strategy "hide". Only "remove" is supported.');

      expect(ElementRemover.removalStats.totalRemoved).toBe(0);
    });

    test('should skip already-processed elements', () => {
      const elements = [
        document.createElement('div'),
        document.createElement('div'),
        document.createElement('div')
      ];

      // Pre-process first element
      ElementRemover.removeElement(elements[0], 'pre-rule');

      const removed = ElementRemover.batchRemove(elements, 'batch-rule');

      expect(removed).toBe(2); // Only 2 new elements
      expect(ElementRemover.removalStats.totalRemoved).toBe(3); // 1 pre + 2 batch
    });

    test('should handle empty array', () => {
      const removed = ElementRemover.batchRemove([], 'batch-rule');

      expect(removed).toBe(0);
      expect(ElementRemover.removalStats.totalRemoved).toBe(0);
    });

    test('should handle array with null elements', () => {
      const elements = [null, document.createElement('div'), undefined];
      document.body.appendChild(elements[1]);

      const removed = ElementRemover.batchRemove(elements, 'batch-rule');

      expect(removed).toBe(1); // Only valid element removed
      expect(ElementRemover.removalStats.totalRemoved).toBe(1);
    });
  });

  describe('isProcessed()', () => {
    test('should return false for unprocessed element', () => {
      const element = document.createElement('div');

      expect(ElementRemover.isProcessed(element)).toBe(false);
    });

    test('should return true for processed element', () => {
      const element = document.createElement('div');
      ElementRemover.removeElement(element, 'test-rule');

      expect(ElementRemover.isProcessed(element)).toBe(true);
    });
  });

  describe('cleanup()', () => {
    test('should reset processedElements WeakSet', () => {
      const element = document.createElement('div');
      ElementRemover.removeElement(element, 'test-rule');

      expect(ElementRemover.isProcessed(element)).toBe(true);

      ElementRemover.cleanup();

      // After cleanup, element should no longer be marked as processed
      expect(ElementRemover.isProcessed(element)).toBe(false);
    });

    test('should reset statistics', () => {
      const elements = [
        document.createElement('div'),
        document.createElement('div')
      ];
      elements.forEach(el => ElementRemover.removeElement(el, 'test-rule'));

      expect(ElementRemover.removalStats.totalRemoved).toBe(2);

      ElementRemover.cleanup();

      expect(ElementRemover.removalStats.totalRemoved).toBe(0);
      expect(ElementRemover.removalStats.lastReset).toBeGreaterThan(0);
    });

    test('should return cleanup result with stats', () => {
      ElementRemover.removeElement(document.createElement('div'), 'test-rule');

      const result = ElementRemover.cleanup();

      expect(result).toEqual({
        success: true,
        stats: {
          totalRemoved: 1,
          lastReset: expect.any(Number)
        }
      });
    });

    test('should update lastCleanupCheck timestamp', () => {
      const beforeCleanup = ElementRemover.lastCleanupCheck;

      // Wait a bit to ensure timestamp changes
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      ElementRemover.cleanup();

      expect(ElementRemover.lastCleanupCheck).toBeGreaterThan(beforeCleanup);

      vi.useRealTimers();
    });
  });

  describe('resetStats()', () => {
    test('should reset stats to initial state', () => {
      ElementRemover.removeElement(document.createElement('div'), 'test-rule');

      expect(ElementRemover.removalStats.totalRemoved).toBe(1);

      ElementRemover.resetStats();

      expect(ElementRemover.removalStats).toEqual({
        totalRemoved: 0,
        lastReset: expect.any(Number)
      });
    });
  });

  describe('performPeriodicCleanupCheck()', () => {
    test('should not reset stats if cache age is below threshold', () => {
      vi.useFakeTimers();

      ElementRemover.removeElement(document.createElement('div'), 'test-rule');
      expect(ElementRemover.removalStats.totalRemoved).toBe(1);

      // Advance 1 minute (below 5 minute threshold)
      vi.advanceTimersByTime(60000);
      ElementRemover.performPeriodicCleanupCheck();

      expect(ElementRemover.removalStats.totalRemoved).toBe(1); // Should not reset

      vi.useRealTimers();
    });

    test('should reset stats after MAX_STATS_AGE_MS', () => {
      vi.useFakeTimers();

      ElementRemover.removeElement(document.createElement('div'), 'test-rule');
      expect(ElementRemover.removalStats.totalRemoved).toBe(1);

      // Advance 6 minutes (above 5 minute threshold)
      vi.advanceTimersByTime(360000);
      ElementRemover.performPeriodicCleanupCheck();

      expect(ElementRemover.removalStats.totalRemoved).toBe(0); // Should reset

      vi.useRealTimers();
    });

    test('should only check every CLEANUP_CHECK_INTERVAL_MS', () => {
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Set lastCleanupCheck to 6 minutes ago
      ElementRemover.removalStats.lastReset = Date.now() - 360000;

      // Advance 20 seconds (below 30 second check interval)
      vi.advanceTimersByTime(20000);
      ElementRemover.performPeriodicCleanupCheck();

      // Should not have checked (no reset)
      expect(consoleSpy).not.toHaveBeenCalled();

      // Advance another 15 seconds (total 35 seconds, above 30 second interval)
      vi.advanceTimersByTime(15000);
      ElementRemover.performPeriodicCleanupCheck();

      // Should have checked and reset
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ElementRemoval]'),
        'Auto-resetting ElementRemover stats due to age',
        expect.objectContaining({
          category: 'ElementRemoval',
          message: 'Auto-resetting ElementRemover stats due to age'
        })
      );

      consoleSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('applyRemovalStrategy()', () => {
    test('should remove element from DOM', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      ElementRemover.applyRemovalStrategy(element);

      expect(document.body.contains(element)).toBe(false);
    });
  });
});
