/**
 * Unit Tests for SelectorExecutor
 * Tests CSS selector execution, domain matching, and time-slicing
 */

import { vi } from 'vitest';
import { SelectorExecutor } from '@modules/rule-execution/executors/selector-executor.js';
import { ElementRemover } from '@modules/ElementRemover.js';

vi.mock('@modules/ElementRemover.js');

describe('SelectorExecutor', () => {
  let executor;
  let mockCoordinator;

  beforeEach(() => {
    mockCoordinator = {
      yieldIfNeeded: vi.fn().mockResolvedValue(undefined)
    };
    executor = new SelectorExecutor(mockCoordinator);

    // Mock DOM
    global.document = {
      querySelectorAll: vi.fn()
    };

    // Mock ElementRemover
    ElementRemover.batchRemove = vi.fn().mockReturnValue(0);
    ElementRemover.REMOVAL_STRATEGIES = {
      REMOVE: 'remove',
      HIDE: 'hide',
      NEUTRALIZE: 'neutralize'
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    delete global.document;
  });

  describe('Basic Execution', () => {
    test('should execute rules for matching domain', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] }
      ];

      const mockElements = [
        { id: 'ad1' },
        { id: 'ad2' }
      ];

      document.querySelectorAll.mockReturnValue(mockElements);
      ElementRemover.batchRemove.mockReturnValue(2);

      const removed = await executor.execute(rules, 'example.com');

      expect(document.querySelectorAll).toHaveBeenCalledWith('.ad');
      expect(ElementRemover.batchRemove).toHaveBeenCalledWith(
        mockElements,
        '1',
        'remove'
      );
      expect(removed).toBe(2);
    });

    test('should skip rules for non-matching domain', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] },
        { id: '2', selector: '#banner', domains: ['test.com'] }
      ];

      const removed = await executor.execute(rules, 'other.com');

      expect(document.querySelectorAll).not.toHaveBeenCalled();
      expect(ElementRemover.batchRemove).not.toHaveBeenCalled();
      expect(removed).toBe(0);
    });

    test('should skip rules that match no elements', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const removed = await executor.execute(rules, 'example.com');

      expect(document.querySelectorAll).toHaveBeenCalled();
      expect(ElementRemover.batchRemove).not.toHaveBeenCalled();
      expect(removed).toBe(0);
    });
  });

  describe('Domain Matching - Exact Match', () => {
    test('should match exact domain', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      const removed = await executor.execute(rules, 'example.com');

      expect(removed).toBe(1);
    });

    test('should not match different domain', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] }
      ];

      const removed = await executor.execute(rules, 'different.com');

      expect(removed).toBe(0);
    });
  });

  describe('Domain Matching - Wildcard', () => {
    test('should match all domains with * wildcard', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      const removed1 = await executor.execute(rules, 'example.com');
      const removed2 = await executor.execute(rules, 'test.com');
      const removed3 = await executor.execute(rules, 'any-domain.org');

      expect(removed1).toBe(1);
      expect(removed2).toBe(1);
      expect(removed3).toBe(1);
    });

    test('should match subdomain with *.example.com pattern', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['*.example.com'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      // Should match
      expect(await executor.execute(rules, 'sub.example.com')).toBe(1);
      expect(await executor.execute(rules, 'deep.sub.example.com')).toBe(1);
      expect(await executor.execute(rules, 'example.com')).toBe(1); // Base domain also matches

      // Should not match
      expect(await executor.execute(rules, 'example.org')).toBe(0);
      expect(await executor.execute(rules, 'notexample.com')).toBe(0);
    });
  });

  describe('Domain Matching - Subdomain', () => {
    test('should match subdomains when base domain is specified', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      // Should match exact and subdomains
      expect(await executor.execute(rules, 'example.com')).toBe(1);
      expect(await executor.execute(rules, 'www.example.com')).toBe(1);
      expect(await executor.execute(rules, 'sub.example.com')).toBe(1);
      expect(await executor.execute(rules, 'deep.sub.example.com')).toBe(1);

      // Should not match
      expect(await executor.execute(rules, 'example.org')).toBe(0);
      expect(await executor.execute(rules, 'notexample.com')).toBe(0);
    });

    test('should handle edge cases in domain matching', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      // Should NOT match partial domain names
      expect(await executor.execute(rules, 'myexample.com')).toBe(0);
      expect(await executor.execute(rules, 'example.com.fake.net')).toBe(0);
    });
  });

  describe('Domain Matching - Multiple Domains', () => {
    test('should match any domain in the list', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com', 'test.com', 'demo.org'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      expect(await executor.execute(rules, 'example.com')).toBe(1);
      expect(await executor.execute(rules, 'test.com')).toBe(1);
      expect(await executor.execute(rules, 'demo.org')).toBe(1);
      expect(await executor.execute(rules, 'other.com')).toBe(0);
    });

    test('should not apply rule with empty domains array', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: [] }
      ];

      const removed = await executor.execute(rules, 'example.com');

      expect(removed).toBe(0);
      expect(document.querySelectorAll).not.toHaveBeenCalled();
    });

    test('should not apply rule with null/undefined domains', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: null },
        { id: '2', selector: '#banner', domains: undefined }
      ];

      const removed = await executor.execute(rules, 'example.com');

      expect(removed).toBe(0);
      expect(document.querySelectorAll).not.toHaveBeenCalled();
    });
  });

  describe('Element Removal', () => {
    test('should call ElementRemover.batchRemove with correct arguments', async () => {
      const rules = [
        { id: 'test-rule', selector: '.ad', domains: ['*'] }
      ];

      const mockElements = [
        { id: 'ad1' },
        { id: 'ad2' },
        { id: 'ad3' }
      ];

      document.querySelectorAll.mockReturnValue(mockElements);
      ElementRemover.batchRemove.mockReturnValue(3);

      await executor.execute(rules, 'example.com');

      expect(ElementRemover.batchRemove).toHaveBeenCalledWith(
        mockElements,
        'test-rule',
        'remove'
      );
    });

    test('should sum removal counts from multiple rules', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['*'] },
        { id: '2', selector: '#banner', domains: ['*'] },
        { id: '3', selector: '.tracking', domains: ['*'] }
      ];

      document.querySelectorAll
        .mockReturnValueOnce([{ id: 'ad1' }, { id: 'ad2' }])
        .mockReturnValueOnce([{ id: 'banner1' }])
        .mockReturnValueOnce([{ id: 'track1' }, { id: 'track2' }, { id: 'track3' }]);

      ElementRemover.batchRemove
        .mockReturnValueOnce(2)
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(3);

      const removed = await executor.execute(rules, 'example.com');

      expect(removed).toBe(6); // 2 + 1 + 3
    });

    test('should use rule ID as removal identifier', async () => {
      const rules = [
        { id: 'custom-id-123', selector: '.ad', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      await executor.execute(rules, 'example.com');

      expect(ElementRemover.batchRemove).toHaveBeenCalledWith(
        expect.anything(),
        'custom-id-123',
        'remove'
      );
    });

    test('should generate fallback ID for rules without ID', async () => {
      const rules = [
        { selector: '.ad', domains: ['*'] } // No ID
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'ad1' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      await executor.execute(rules, 'example.com');

      expect(ElementRemover.batchRemove).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^rule-\d+$/),
        'remove'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle querySelectorAll errors gracefully', async () => {
      const rules = [
        { id: '1', selector: '.valid', domains: ['*'] },
        { id: '2', selector: '[invalid', domains: ['*'] },
        { id: '3', selector: '.also-valid', domains: ['*'] }
      ];

      document.querySelectorAll.mockImplementation((selector) => {
        if (selector === '[invalid') {
          throw new Error('Invalid selector');
        }
        return [{ id: 'elem' }];
      });

      ElementRemover.batchRemove.mockReturnValue(1);

      const removed = await executor.execute(rules, 'example.com');

      // Should continue with valid rules
      expect(removed).toBe(2); // Only valid rules executed
    });

    test('should handle ElementRemover errors gracefully', async () => {
      const rules = [
        { id: '1', selector: '.ad1', domains: ['*'] },
        { id: '2', selector: '.ad2', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'elem' }]);
      ElementRemover.batchRemove
        .mockImplementationOnce(() => {
          throw new Error('Removal error');
        })
        .mockReturnValueOnce(1);

      const removed = await executor.execute(rules, 'example.com');

      // Should continue with second rule despite first failing
      expect(removed).toBe(1);
    });

    test('should handle null/undefined current domain', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['example.com'] }
      ];

      const removed1 = await executor.execute(rules, null);
      const removed2 = await executor.execute(rules, undefined);
      const removed3 = await executor.execute(rules, '');

      expect(removed1).toBe(0);
      expect(removed2).toBe(0);
      expect(removed3).toBe(0);
    });
  });

  describe('Time-Slicing Integration', () => {
    test('should call yieldIfNeeded when timeSlicing is enabled', async () => {
      const rules = [
        { id: '1', selector: '.ad1', domains: ['*'] },
        { id: '2', selector: '.ad2', domains: ['*'] },
        { id: '3', selector: '.ad3', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'elem' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      await executor.execute(rules, 'example.com', {
        timeSlicing: true,
        maxExecutionTime: 16
      });

      expect(mockCoordinator.yieldIfNeeded).toHaveBeenCalledTimes(3);
    });

    test('should not call yieldIfNeeded when timeSlicing is disabled', async () => {
      const rules = [
        { id: '1', selector: '.ad1', domains: ['*'] },
        { id: '2', selector: '.ad2', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'elem' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      await executor.execute(rules, 'example.com', {
        timeSlicing: false
      });

      expect(mockCoordinator.yieldIfNeeded).not.toHaveBeenCalled();
    });

    test('should pass correct parameters to yieldIfNeeded', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'elem' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      const startTime = Date.now();
      await executor.execute(rules, 'example.com', {
        timeSlicing: true,
        maxExecutionTime: 20
      });

      expect(mockCoordinator.yieldIfNeeded).toHaveBeenCalledWith(
        expect.any(Number),
        20
      );
    });

    test('should work without coordinator (graceful degradation)', async () => {
      const executorWithoutCoordinator = new SelectorExecutor(null);

      const rules = [
        { id: '1', selector: '.ad', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([{ id: 'elem' }]);
      ElementRemover.batchRemove.mockReturnValue(1);

      // Should not throw
      const removed = await executorWithoutCoordinator.execute(rules, 'example.com', {
        timeSlicing: true
      });

      expect(removed).toBe(1);
    });
  });

  describe('Cleanup', () => {
    test('should clear processedElements WeakSet on cleanup', () => {
      // WeakSet is internal, just ensure cleanup doesn't throw
      expect(() => executor.cleanup()).not.toThrow();
    });
  });
});
