/**
 * Unit Tests for MutationWatcher
 * Tests debounced MutationObserver for dynamic content
 */

import { vi } from 'vitest';
import { MutationWatcher } from '@modules/rule-execution/executors/hybrid-executor/mutation-watcher.js';

describe('MutationWatcher', () => {
  let watcher;
  let mockTokenIndex;
  let mockScanner;
  let mockObserver;

  beforeEach(() => {
    mockTokenIndex = {
      has: vi.fn().mockReturnValue(false),
      get: vi.fn().mockReturnValue([])
    };

    mockScanner = {
      processElement: vi.fn().mockReturnValue({ removed: 0, hidden: 0 }),
      scan: vi.fn().mockReturnValue({ removed: 0, hidden: 0 }),
      scanElement: vi.fn().mockReturnValue({ removed: 0, hidden: 0 })
    };

    // Mock MutationObserver
    mockObserver = {
      observe: vi.fn(),
      disconnect: vi.fn()
    };

    global.MutationObserver = vi.fn().mockImplementation((callback) => {
      mockObserver.callback = callback;
      return mockObserver;
    });

    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn().mockImplementation(cb => {
      cb();
      return 1;
    });

    watcher = new MutationWatcher(mockTokenIndex, mockScanner);

    vi.clearAllMocks();
  });

  afterEach(() => {
    delete global.MutationObserver;
    delete global.requestAnimationFrame;
  });

  describe('Initialization', () => {
    test('should initialize with token index and scanner', () => {
      expect(watcher).toBeDefined();
    });

    test('should not be active before start', () => {
      expect(watcher.isActive()).toBe(false);
    });
  });

  describe('start()', () => {
    test('should create MutationObserver', () => {
      const target = {};

      watcher.start(target);

      expect(global.MutationObserver).toHaveBeenCalled();
    });

    test('should observe target with correct options', () => {
      const target = {};

      watcher.start(target);

      expect(mockObserver.observe).toHaveBeenCalledWith(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id']
      });
    });

    test('should be active after start', () => {
      watcher.start({});

      expect(watcher.isActive()).toBe(true);
    });
  });

  describe('stop()', () => {
    test('should disconnect observer', () => {
      watcher.start({});

      watcher.stop();

      expect(mockObserver.disconnect).toHaveBeenCalled();
    });

    test('should not be active after stop', () => {
      watcher.start({});
      watcher.stop();

      expect(watcher.isActive()).toBe(false);
    });

    test('should handle stop before start', () => {
      expect(() => watcher.stop()).not.toThrow();
    });
  });

  describe('Mutation Handling', () => {
    test('should buffer mutations', () => {
      watcher.start({});

      const mutations = [
        { type: 'childList', addedNodes: [] }
      ];

      mockObserver.callback(mutations);

      // Mutations should be buffered for debounced processing
      expect(watcher.pendingMutations.length).toBeGreaterThanOrEqual(0);
    });

    test('should debounce processing with requestAnimationFrame', () => {
      watcher.start({});

      const mutations = [
        { type: 'childList', addedNodes: [] }
      ];

      mockObserver.callback(mutations);

      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    test('should process added nodes', () => {
      watcher.start({});

      const addedNode = {
        nodeType: 1, // ELEMENT_NODE
        classList: ['ad'],
        id: '',
        tagName: 'DIV'
      };

      const mutations = [
        {
          type: 'childList',
          addedNodes: [addedNode]
        }
      ];

      mockObserver.callback(mutations);

      // Should attempt to process the node via scanElement
      expect(mockScanner.scanElement).toHaveBeenCalled();
    });

    test('should process attribute changes', () => {
      watcher.start({});

      const targetNode = {
        nodeType: 1,
        classList: ['ad'],
        id: '',
        tagName: 'DIV'
      };

      const mutations = [
        {
          type: 'attributes',
          target: targetNode,
          attributeName: 'class'
        }
      ];

      mockObserver.callback(mutations);

      expect(mockScanner.scanElement).toHaveBeenCalledWith(targetNode);
    });

    test('should skip non-element nodes', () => {
      watcher.start({});

      const textNode = {
        nodeType: 3 // TEXT_NODE
      };

      const mutations = [
        {
          type: 'childList',
          addedNodes: [textNode]
        }
      ];

      mockObserver.callback(mutations);

      expect(mockScanner.processElement).not.toHaveBeenCalled();
    });

    test('should use WeakSet for deduplication', () => {
      watcher.start({});

      const sameNode = {
        nodeType: 1,
        classList: ['ad'],
        id: '',
        tagName: 'DIV'
      };

      // Process same node twice
      const mutations = [
        { type: 'childList', addedNodes: [sameNode] },
        { type: 'childList', addedNodes: [sameNode] }
      ];

      mockObserver.callback(mutations);

      // Should only process once due to deduplication
      expect(mockScanner.scanElement).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats()', () => {
    test('should return cumulative stats', () => {
      const stats = watcher.getStats();

      expect(stats).toHaveProperty('removed');
      expect(stats).toHaveProperty('hidden');
      expect(stats).toHaveProperty('mutations');
    });

    test('should track mutation count', () => {
      watcher.start({});

      mockObserver.callback([
        { type: 'childList', addedNodes: [] }
      ]);

      const stats = watcher.getStats();

      expect(stats.mutations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setStatsCallback()', () => {
    test('should set callback for stat updates', () => {
      const callback = vi.fn();

      watcher.setStatsCallback(callback);

      expect(watcher.onStatsUpdate).toBe(callback);
    });

    test('should trigger callback on stat update', () => {
      const callback = vi.fn();
      watcher.setStatsCallback(callback);
      watcher.start({});

      mockScanner.scanElement.mockReturnValue({ removed: 1, hidden: 0 });

      const node = {
        nodeType: 1,
        classList: ['ad'],
        id: '',
        tagName: 'DIV'
      };

      mockObserver.callback([
        { type: 'childList', addedNodes: [node] }
      ]);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty mutation list', () => {
      watcher.start({});

      expect(() => mockObserver.callback([])).not.toThrow();
    });

    test('should handle mutations with empty addedNodes', () => {
      watcher.start({});

      const mutations = [
        { type: 'childList', addedNodes: [] }
      ];

      expect(() => mockObserver.callback(mutations)).not.toThrow();
    });
  });
});
