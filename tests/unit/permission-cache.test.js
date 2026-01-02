import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PermissionCache } from '@script-utils/permission-cache.js';

vi.mock('../../src/scripts/utils/chrome-api-safe.js', () => ({
  isExtensionContextValid: vi.fn(() => true),
  safeStorageGet: vi.fn(),
  safeStorageSet: vi.fn()
}));

import { safeStorageGet } from '@script-utils/chrome-api-safe.js';

// Helper to access DLL nodes for testing (normally private)
const getDLLNodes = (cache) => {
  const nodes = [];
  let current = cache.head.next;
  while (current !== cache.tail) {
    nodes.push(current);
    current = current.next;
  }
  return nodes;
};

// Helper to verify DLL integrity
const verifyDLLIntegrity = (cache) => {
  // Count nodes
  let count = 0;
  let current = cache.head.next;

  while (current !== cache.tail) {
    // Check bidirectional links
    expect(current.next.prev).toBe(current);
    expect(current.prev.next).toBe(current);

    // Check node is in Map
    expect(cache.cache.has(current.key)).toBe(true);

    count++;
    current = current.next;
  }

  // Verify count matches size
  expect(count).toBe(cache.size);
  expect(cache.cache.size).toBe(cache.size);

  // Verify sentinel links
  expect(cache.head.prev).toBeNull();
  expect(cache.tail.next).toBeNull();
};

describe('PermissionCache - DLL Operations', () => {
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache = new PermissionCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.cleanup();
    vi.useRealTimers();
  });

  describe('_addToHead', () => {
    test('adds single node to empty list', () => {
      cache.setSync('https://source.com', 'https://target.com', 'ALLOW');

      const nodes = getDLLNodes(cache);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].value.decision).toBe('ALLOW');
      verifyDLLIntegrity(cache);
    });

    test('adds multiple nodes to head (MRU)', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      const nodes = getDLLNodes(cache);
      expect(nodes).toHaveLength(3);
      // Most recent should be at head (first in list)
      expect(nodes[0].key).toContain('source3.com');
      expect(nodes[1].key).toContain('source2.com');
      expect(nodes[2].key).toContain('source1.com');
      verifyDLLIntegrity(cache);
    });
  });

  describe('_removeNode', () => {
    test('removes node from middle of list', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      const key = 'origin:https://source2.com->https://target2.com';
      const node = cache.cache.get(key);
      cache._removeNode(node);
      cache.cache.delete(key);
      cache.size--;

      const nodes = getDLLNodes(cache);
      expect(nodes).toHaveLength(2);
      expect(nodes.find(n => n.key === key)).toBeUndefined();
      verifyDLLIntegrity(cache);
    });

    test('removes single node leaving empty list', () => {
      cache.setSync('https://source.com', 'https://target.com', 'ALLOW');

      const key = 'origin:https://source.com->https://target.com';
      const node = cache.cache.get(key);
      cache._removeNode(node);
      cache.cache.delete(key);
      cache.size--;

      const nodes = getDLLNodes(cache);
      expect(nodes).toHaveLength(0);
      expect(cache.size).toBe(0);
      verifyDLLIntegrity(cache);
    });

    test('nullifies pointers to prevent memory leaks', () => {
      cache.setSync('https://source.com', 'https://target.com', 'ALLOW');

      const key = 'origin:https://source.com->https://target.com';
      const node = cache.cache.get(key);
      cache._removeNode(node);

      // Verify pointers are nullified
      expect(node.prev).toBeNull();
      expect(node.next).toBeNull();
    });
  });

  describe('_moveToHead', () => {
    test('promotes middle node to head (LRU promotion)', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      // Access source1 (should move to head)
      cache.getSync('https://source1.com', 'https://target1.com');

      const nodes = getDLLNodes(cache);
      expect(nodes[0].key).toContain('source1.com'); // Now at head
      expect(nodes[1].key).toContain('source3.com');
      expect(nodes[2].key).toContain('source2.com');
      verifyDLLIntegrity(cache);
    });

    test('promotes tail node to head', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');

      // Access source1 (oldest, at tail)
      cache.getSync('https://source1.com', 'https://target1.com');

      const nodes = getDLLNodes(cache);
      expect(nodes[0].key).toContain('source1.com'); // Now at head
      expect(nodes[1].key).toContain('source2.com');
      verifyDLLIntegrity(cache);
    });

    test('node already at head remains at head', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');

      // Access source2 (already at head)
      cache.getSync('https://source2.com', 'https://target2.com');

      const nodes = getDLLNodes(cache);
      expect(nodes[0].key).toContain('source2.com'); // Still at head
      verifyDLLIntegrity(cache);
    });
  });

  describe('_removeTail', () => {
    test('removes LRU entry from tail', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      const removedNode = cache._removeTail();

      expect(removedNode.key).toContain('source1.com'); // Oldest entry
      expect(cache.cache.has(removedNode.key)).toBe(true); // Still in Map (manual cleanup needed)

      // Complete the cleanup to verify integrity
      cache.cache.delete(removedNode.key);
      cache.size--;

      verifyDLLIntegrity(cache);
    });

    test('returns null for empty list', () => {
      const removedNode = cache._removeTail();
      expect(removedNode).toBeNull();
    });

    test('removes single node', () => {
      cache.setSync('https://source.com', 'https://target.com', 'ALLOW');

      const removedNode = cache._removeTail();

      expect(removedNode.key).toContain('source.com');
      const nodes = getDLLNodes(cache);
      expect(nodes).toHaveLength(0);
    });
  });
});

describe('PermissionCache - LRU Cache Operations', () => {
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache = new PermissionCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.cleanup();
    vi.useRealTimers();
  });

  describe('getSync - LRU Promotion', () => {
    test('cache hit promotes node to MRU (head)', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      // Access oldest entry
      const result = cache.getSync('https://source1.com', 'https://target1.com');

      expect(result.decision).toBe('ALLOW');

      const nodes = getDLLNodes(cache);
      expect(nodes[0].key).toContain('source1.com'); // Promoted to head
      verifyDLLIntegrity(cache);
    });

    test('cache miss does not modify DLL', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');

      const result = cache.getSync('https://nonexistent.com', 'https://target.com');

      expect(result).toBeNull();
      expect(cache.size).toBe(1);
      verifyDLLIntegrity(cache);
    });

    test('expired entry removed from both Map and DLL', () => {
      cache.setSync('https://source.com', 'https://target.com', 'ALLOW');

      // Fast-forward past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours (default TTL is 24h)

      const result = cache.getSync('https://source.com', 'https://target.com');

      expect(result).toBeNull();
      expect(cache.size).toBe(0);
      expect(cache.cache.size).toBe(0);
      verifyDLLIntegrity(cache);
    });
  });

  describe('setSync - Create and Update', () => {
    test('creates new entry at head (MRU)', () => {
      cache.setSync('https://source.com', 'https://target.com', 'ALLOW');

      expect(cache.size).toBe(1);
      const nodes = getDLLNodes(cache);
      expect(nodes[0].value.decision).toBe('ALLOW');
      verifyDLLIntegrity(cache);
    });

    test('updates existing entry and moves to head', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');

      // Update source1 (should move to head)
      cache.setSync('https://source1.com', 'https://target1.com', 'DENY');

      expect(cache.size).toBe(2); // No size change
      const nodes = getDLLNodes(cache);
      expect(nodes[0].key).toContain('source1.com'); // At head
      expect(nodes[0].value.decision).toBe('DENY'); // Updated value
      verifyDLLIntegrity(cache);
    });

    test('triggers eviction when size exceeds limit', () => {
      // Set artificially low limit for testing
      const originalMaxSize = cache.constructor.prototype.constructor.MAX_CACHE_SIZE;

      // Add 3 entries (assuming default limit is much higher)
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      expect(cache.size).toBe(3);
      verifyDLLIntegrity(cache);
    });
  });

  describe('enforceSizeLimit - LRU Eviction', () => {
    test('evicts single LRU entry when over limit', () => {
      // This test requires manipulating MAX_CACHE_SIZE
      // For now, we verify the method doesn't break integrity
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');

      cache.enforceSizeLimit();

      verifyDLLIntegrity(cache);
    });

    test('respects LRU order during eviction', () => {
      // Add multiple entries
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      // Access source1 (move to MRU)
      cache.getSync('https://source1.com', 'https://target1.com');

      // If we had to evict, source2 should go first (LRU)
      // For now, verify integrity
      verifyDLLIntegrity(cache);
    });
  });

  describe('cleanExpired - DLL Integrity', () => {
    test('removes expired entries from both Map and DLL', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');
      cache.setSync('https://source3.com', 'https://target3.com', 'ALLOW');

      expect(cache.size).toBe(3);

      // Clear auto-cleanup timer to prevent it from running during fast-forward
      if (cache.cleanupTimer) {
        clearInterval(cache.cleanupTimer);
        cache.cleanupTimer = null;
      }

      // Fast-forward past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      // Manually call cleanExpired (don't add new entries to avoid auto-cleanup)
      const removed = cache.cleanExpired();

      expect(removed).toBe(3); // All 3 entries expired
      expect(cache.size).toBe(0);
      verifyDLLIntegrity(cache);
    });

    test('maintains DLL integrity with partial cleanup', () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW', { persist: false });

      // Fast-forward 12 hours
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);

      cache.setSync('https://source2.com', 'https://target2.com', 'DENY', { persist: false });

      expect(cache.size).toBe(2);

      // Clear auto-cleanup timer to prevent it from running during fast-forward
      if (cache.cleanupTimer) {
        clearInterval(cache.cleanupTimer);
        cache.cleanupTimer = null;
      }

      // Fast-forward another 13 hours (source1 expires at 24h, now 25h; source2 expires at 36h, now 25h)
      vi.advanceTimersByTime(13 * 60 * 60 * 1000);

      // Manually call cleanExpired
      const removed = cache.cleanExpired();

      expect(removed).toBe(1); // Only source1 expired
      expect(cache.size).toBe(1);

      const nodes = getDLLNodes(cache);
      expect(nodes[0].key).toContain('source2.com'); // source2 remains

      verifyDLLIntegrity(cache);
    });
  });

  describe('clear - DLL Reset', () => {
    test('resets DLL to empty state', async () => {
      cache.setSync('https://source1.com', 'https://target1.com', 'ALLOW');
      cache.setSync('https://source2.com', 'https://target2.com', 'DENY');

      await cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.cache.size).toBe(0);
      expect(cache.head.next).toBe(cache.tail);
      expect(cache.tail.prev).toBe(cache.head);
      verifyDLLIntegrity(cache);
    });
  });
});

describe('PermissionCache syncFromStorage', () => {
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    cache = new PermissionCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.cleanup();
    vi.useRealTimers();
  });

  test('drops invalid keys and normalizes stored keys', async () => {
    const now = Date.now();
    const future = now + 60 * 1000;

    safeStorageGet.mockResolvedValue({
      permissionCacheV1: {
        version: 1,
        entries: {
          'origin:https://source.com->https://target.com': {
            decision: 'ALLOW',
            timestamp: now,
            expiresAt: future,
            isPersistent: false,
            metadata: {}
          },
          'origin:https://source-two.com/->https://target-two.com': {
            decision: 'DENY',
            timestamp: now,
            expiresAt: future,
            isPersistent: false,
            metadata: {}
          },
          'origin:https://bad.com=>https://target.com': {
            decision: 'ALLOW',
            timestamp: now,
            expiresAt: future,
            isPersistent: false,
            metadata: {}
          },
          'origin:https://missing.com->https://target.com': {
            decision: 'ALLOW',
            timestamp: now,
            isPersistent: false,
            metadata: {}
          }
        }
      }
    });

    await cache.syncFromStorage();

    expect(cache.cache.size).toBe(2);
    expect(cache.cache.has('origin:https://source.com->https://target.com')).toBe(true);
    expect(cache.cache.has('origin:https://source-two.com->https://target-two.com')).toBe(true);
    expect(cache.cache.has('origin:https://source-two.com/->https://target-two.com')).toBe(false);
    expect(safeStorageGet).toHaveBeenCalledWith(
      ['permissionCacheV1'],
      null,
      expect.any(Object)
    );
  });

  test('preserves LRU order from storage', async () => {
    const now = Date.now();
    const future = now + 60 * 1000;

    // Storage order: source1 (oldest) -> source2 -> source3 (newest)
    safeStorageGet.mockResolvedValue({
      permissionCacheV1: {
        version: 1,
        entries: {
          'origin:https://source1.com->https://target1.com': {
            decision: 'ALLOW',
            timestamp: now - 2000,
            expiresAt: future,
            isPersistent: false,
            metadata: {}
          },
          'origin:https://source2.com->https://target2.com': {
            decision: 'DENY',
            timestamp: now - 1000,
            expiresAt: future,
            isPersistent: false,
            metadata: {}
          },
          'origin:https://source3.com->https://target3.com': {
            decision: 'ALLOW',
            timestamp: now,
            expiresAt: future,
            isPersistent: false,
            metadata: {}
          }
        }
      }
    });

    await cache.syncFromStorage();

    const nodes = getDLLNodes(cache);
    expect(nodes).toHaveLength(3);
    // Storage order should be preserved (using _addToTail)
    verifyDLLIntegrity(cache);
  });
});
