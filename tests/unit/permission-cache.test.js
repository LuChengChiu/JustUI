import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PermissionCache } from '@script-utils/permission-cache.js';

vi.mock('../../src/scripts/utils/chromeApiSafe.js', () => ({
  isExtensionContextValid: vi.fn(() => true),
  safeStorageGet: vi.fn(),
  safeStorageSet: vi.fn()
}));

import { safeStorageGet } from '@script-utils/chromeApiSafe.js';

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
});
