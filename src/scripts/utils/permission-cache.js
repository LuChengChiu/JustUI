/**
 * Permission Cache System for Navigation Guardian
 *
 * Provides in-memory + persistent caching of user navigation permission decisions
 * to reduce modal fatigue and improve UX while maintaining security.
 *
 * Features:
 * - Fast in-memory Map cache for <1ms lookups
 * - Chrome storage persistence with debouncing
 * - LRU eviction at 500 entries
 * - TTL expiration (24h default, 30d with "Remember" checkbox)
 * - Statistics tracking for cache performance
 */

import { isExtensionContextValid, safeStorageGet, safeStorageSet } from './chromeApiSafe.js';
import { normalizeOrigin } from '../../utils/url-utils.js';

// Storage key for permission cache
const STORAGE_KEY = 'permissionCacheV1';
const CACHE_KEY_PREFIX = 'origin:';
const CACHE_KEY_SEPARATOR = '->';

// Default configuration
const CONFIG = {
  MAX_CACHE_SIZE: 500,                        // Maximum number of entries (LRU eviction)
  DEFAULT_TTL_MS: 24 * 60 * 60 * 1000,        // 24 hours
  PERSISTENT_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  SYNC_DEBOUNCE_MS: 2000,                     // Debounce storage writes (2 seconds)
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,         // Auto-cleanup every 5 minutes
  VERSION: 1                                   // Schema version for migrations
};

/**
 * Permission Cache Entry
 * @typedef {Object} CacheEntry
 * @property {string} decision - 'ALLOW' or 'DENY'
 * @property {number} timestamp - Creation timestamp (ms)
 * @property {number} expiresAt - Expiration timestamp (ms)
 * @property {boolean} isPersistent - Whether entry uses 30-day TTL
 * @property {Object} metadata - Additional context (riskScore, userAgent, etc.)
 */

/**
 * Permission Cache Class
 *
 * Manages user navigation permission decisions with in-memory + persistent storage
 */
export class PermissionCache {
  constructor() {
    // In-memory cache for fast lookups
    this.cache = new Map();

    // Statistics tracking
    this.stats = {
      totalEntries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      evictions: 0,
      storageSync: 0,
      lastSyncTime: 0
    };

    // Debounce timer for storage sync
    this.syncTimer = null;
    this.syncPending = false;

    // Auto-cleanup timer
    this.cleanupTimer = null;

    // Unload handler for cleanup
    this.unloadHandler = this.handleUnload.bind(this);

    // Initialize auto-cleanup
    this.startAutoCleanup();

    // Stop timers on page unload
    this.setupUnloadCleanup();
  }

  /**
   * Generate cache key from source and target origins
   * Format: "origin:https://app.com->https://oauth.com"
   *
   * @param {string} sourceOrigin - Source page origin
   * @param {string} targetOrigin - Target navigation origin
   * @returns {string} Cache key
   */
  static getCacheKey(sourceOrigin, targetOrigin) {
    const normalizedSource = normalizeOrigin(sourceOrigin);
    const normalizedTarget = normalizeOrigin(targetOrigin);

    if (!normalizedSource || !normalizedTarget) {
      return null;
    }

    return `${CACHE_KEY_PREFIX}${normalizedSource}${CACHE_KEY_SEPARATOR}${normalizedTarget}`;
  }

  /**
   * Normalize a stored cache key to canonical format.
   *
   * @param {string} key
   * @returns {string|null}
   */
  static normalizeCacheKey(key) {
    if (typeof key !== 'string' || !key.startsWith(CACHE_KEY_PREFIX)) {
      return null;
    }

    const raw = key.slice(CACHE_KEY_PREFIX.length);
    const separatorIndex = raw.indexOf(CACHE_KEY_SEPARATOR);
    if (separatorIndex <= 0) {
      return null;
    }

    const sourcePart = raw.slice(0, separatorIndex);
    const targetPart = raw.slice(separatorIndex + CACHE_KEY_SEPARATOR.length);
    if (!sourcePart || !targetPart) {
      return null;
    }

    const normalizedSource = normalizeOrigin(sourcePart);
    const normalizedTarget = normalizeOrigin(targetPart);

    if (!normalizedSource || !normalizedTarget) {
      return null;
    }

    return `${CACHE_KEY_PREFIX}${normalizedSource}${CACHE_KEY_SEPARATOR}${normalizedTarget}`;
  }

  /**
   * Synchronous cache lookup (fast path - in-memory only)
   * Returns cached decision or null if not found/expired
   *
   * @param {string} sourceOrigin - Source page origin
   * @param {string} targetOrigin - Target navigation origin
   * @returns {Object|null} Cache entry or null
   */
  getSync(sourceOrigin, targetOrigin) {
    const key = PermissionCache.getCacheKey(sourceOrigin, targetOrigin);
    if (!key) {
      this.stats.cacheMisses++;
      return null;
    }
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.cacheMisses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.cacheMisses++;
      return null;
    }

    this.stats.cacheHits++;
    return {
      decision: entry.decision,
      isExpired: false,
      metadata: entry.metadata
    };
  }

  /**
   * Asynchronous cache lookup (includes storage fallback)
   * Use this on initialization or when sync lookup misses
   *
   * @param {string} sourceOrigin - Source page origin
   * @param {string} targetOrigin - Target navigation origin
   * @returns {Promise<Object|null>} Cache entry or null
   */
  async get(sourceOrigin, targetOrigin) {
    // Try in-memory first
    const syncResult = this.getSync(sourceOrigin, targetOrigin);
    if (syncResult) {
      return syncResult;
    }

    // Fallback to storage (in case cache was recently cleared)
    try {
      await this.syncFromStorage();
      return this.getSync(sourceOrigin, targetOrigin);
    } catch (error) {
      console.warn('PermissionCache: Storage fallback failed:', error);
      return null;
    }
  }

  /**
   * Synchronous cache write (fast path - in-memory + debounced storage)
   *
   * @param {string} sourceOrigin - Source page origin
   * @param {string} targetOrigin - Target navigation origin
   * @param {string} decision - 'ALLOW' or 'DENY'
   * @param {Object} options - Configuration options
   * @param {boolean} options.persist - Use 30-day TTL instead of 24h
   * @param {Object} options.metadata - Additional context
   */
  setSync(sourceOrigin, targetOrigin, decision, options = {}) {
    const key = PermissionCache.getCacheKey(sourceOrigin, targetOrigin);
    if (!key) {
      console.warn('PermissionCache: Skipping cache write due to invalid origin(s)', {
        sourceOrigin,
        targetOrigin
      });
      return;
    }
    const { persist = false, metadata = {} } = options;

    const ttl = persist ? CONFIG.PERSISTENT_TTL_MS : CONFIG.DEFAULT_TTL_MS;
    const timestamp = Date.now();

    const entry = {
      decision: decision,
      timestamp: timestamp,
      expiresAt: timestamp + ttl,
      isPersistent: persist,
      metadata: metadata
    };

    // Update in-memory cache
    this.cache.set(key, entry);
    this.stats.totalEntries = this.cache.size;

    // Enforce size limit (LRU eviction)
    this.enforceSizeLimit();

    // Debounced sync to storage
    this.scheduleStorageSync();
  }

  /**
   * Asynchronous cache write (immediate storage sync)
   * Use sparingly - prefer setSync() for better performance
   *
   * @param {string} sourceOrigin - Source page origin
   * @param {string} targetOrigin - Target navigation origin
   * @param {string} decision - 'ALLOW' or 'DENY'
   * @param {Object} options - Configuration options
   * @returns {Promise<void>}
   */
  async set(sourceOrigin, targetOrigin, decision, options = {}) {
    this.setSync(sourceOrigin, targetOrigin, decision, options);
    await this.syncToStorage();
  }

  /**
   * Remove expired entries from cache
   * Called automatically every 5 minutes and before eviction
   *
   * @returns {number} Number of entries removed
   */
  cleanExpired() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.stats.totalEntries = this.cache.size;
      console.log(`PermissionCache: Cleaned ${removed} expired entries`);
    }

    return removed;
  }

  /**
   * Enforce maximum cache size using LRU eviction
   * Evicts oldest entries by timestamp when size exceeds limit
   *
   * @private
   */
  enforceSizeLimit() {
    // Clean expired first (free space without evicting valid entries)
    this.cleanExpired();

    if (this.cache.size <= CONFIG.MAX_CACHE_SIZE) {
      return; // Within limit
    }

    // Calculate how many to evict
    const excessCount = this.cache.size - CONFIG.MAX_CACHE_SIZE;

    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, timestamp: entry.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Evict oldest entries
    const toRemove = entries.slice(0, excessCount);

    for (const { key } of toRemove) {
      this.cache.delete(key);
      this.stats.evictions++;
    }

    this.stats.totalEntries = this.cache.size;

    console.log(`PermissionCache: Evicted ${excessCount} LRU entries (size limit: ${CONFIG.MAX_CACHE_SIZE})`);
  }

  /**
   * Schedule debounced storage sync
   * Batches multiple cache updates into single write operation
   *
   * @private
   */
  scheduleStorageSync() {
    if (!isExtensionContextValid()) {
      this.syncPending = false;
      return;
    }

    // Clear existing timer
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    // Mark sync as pending
    this.syncPending = true;

    // Schedule new sync
    this.syncTimer = setTimeout(() => {
      this.syncToStorage()
        .catch(error => {
          console.error('PermissionCache: Scheduled sync failed:', error);
        })
        .finally(() => {
          this.syncTimer = null;
        });
    }, CONFIG.SYNC_DEBOUNCE_MS);
  }

  /**
   * Sync in-memory cache to Chrome storage
   * Debounced to reduce API overhead
   *
   * @returns {Promise<void>}
   */
  async syncToStorage() {
    if (!isExtensionContextValid()) {
      this.syncPending = false;
      return; // No extension context available for storage access
    }

    if (!this.syncPending && !this.syncTimer) {
      return; // No changes to sync
    }

    try {
      // Convert Map to plain object for storage
      const entries = {};
      for (const [key, entry] of this.cache.entries()) {
        entries[key] = entry;
      }

      const data = {
        version: CONFIG.VERSION,
        entries: entries,
        stats: {
          ...this.stats,
          lastSyncTime: Date.now()
        }
      };

      // Write to storage using safe API
      await safeStorageSet(
        { [STORAGE_KEY]: data },
        {
          maxRetries: 3,
          validateWrite: false, // Skip validation for performance
          useCircuitBreaker: true
        }
      );

      this.syncPending = false;
      this.stats.storageSync++;
      this.stats.lastSyncTime = Date.now();

      console.log(`PermissionCache: Synced ${this.cache.size} entries to storage`);
    } catch (error) {
      console.error('PermissionCache: Failed to sync to storage:', error);
      // Don't throw - graceful degradation (cache continues in-memory)
    }
  }

  /**
   * Load cache from Chrome storage
   * Called on initialization to restore persistent cache
   *
   * @returns {Promise<void>}
   */
  async syncFromStorage() {
    try {
      if (!isExtensionContextValid()) {
        return; // No extension context available for storage access
      }

      const result = await safeStorageGet([STORAGE_KEY], null, {
        maxRetries: 3,
        useCircuitBreaker: true
      });

      const data = result[STORAGE_KEY];

      if (!data || data.version !== CONFIG.VERSION) {
        console.log('PermissionCache: No valid cache data found in storage');
        return;
      }

      // Restore entries to Map
      const entries = data.entries || {};
      const now = Date.now();
      let loaded = 0;
      let expired = 0;
      let invalid = 0;
      let normalized = 0;

      for (const [key, entry] of Object.entries(entries)) {
        const normalizedKey = PermissionCache.normalizeCacheKey(key);
        if (!normalizedKey) {
          invalid++;
          continue;
        }

        if (!entry || typeof entry.expiresAt !== 'number') {
          invalid++;
          continue;
        }

        // Skip expired entries
        if (now > entry.expiresAt) {
          expired++;
          continue;
        }

        if (normalizedKey !== key) {
          normalized++;
        }

        this.cache.set(normalizedKey, entry);
        loaded++;
      }

      // Restore statistics
      if (data.stats) {
        this.stats = { ...this.stats, ...data.stats };
      }

      this.stats.totalEntries = this.cache.size;

      console.log(
        `PermissionCache: Loaded ${loaded} entries from storage (${expired} expired, ${invalid} invalid, ${normalized} normalized)`
      );
    } catch (error) {
      console.error('PermissionCache: Failed to load from storage:', error);
      // Don't throw - start with empty cache
    }
  }

  /**
   * Start automatic cleanup timer
   * Removes expired entries every 5 minutes
   *
   * @private
   */
  startAutoCleanup() {
    // Clear existing timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanExpired();
    }, CONFIG.CLEANUP_INTERVAL_MS);

    console.log(`PermissionCache: Auto-cleanup enabled (interval: ${CONFIG.CLEANUP_INTERVAL_MS / 1000 / 60}min)`);
  }

  /**
   * Register page unload cleanup
   *
   * @private
   */
  setupUnloadCleanup() {
    if (typeof window === 'undefined' || !window.addEventListener) {
      return;
    }

    window.addEventListener('pagehide', this.unloadHandler);
    window.addEventListener('beforeunload', this.unloadHandler);
  }

  /**
   * Remove page unload cleanup handler
   *
   * @private
   */
  removeUnloadCleanup() {
    if (typeof window === 'undefined' || !window.removeEventListener) {
      return;
    }

    window.removeEventListener('pagehide', this.unloadHandler);
    window.removeEventListener('beforeunload', this.unloadHandler);
  }

  /**
   * Stop timers and handlers on unload
   *
   * @private
   */
  handleUnload() {
    // Best-effort final sync before teardown (pagehide/beforeunload).
    this.syncToStorage().catch(error => {
      console.error('PermissionCache: Final sync failed on unload:', error);
    });
    this.cleanup();
  }

  /**
   * Stop automatic cleanup timer
   * Called when cache is no longer needed
   */
  stopAutoCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('PermissionCache: Auto-cleanup disabled');
    }
  }

  /**
   * Cleanup timers and event handlers
   */
  cleanup() {
    this.stopAutoCleanup();

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    this.removeUnloadCleanup();
  }

  /**
   * Clear all cache entries and sync to storage
   * Use with caution - removes all user permission decisions
   *
   * @returns {Promise<void>}
   */
  async clear() {
    this.cache.clear();
    this.stats.totalEntries = 0;

    console.log('PermissionCache: Cache cleared');

    // Sync empty cache to storage
    await this.syncToStorage();
  }

  /**
   * Get cache statistics
   * Useful for monitoring and debugging
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
        ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2) + '%'
        : '0%',
      config: {
        maxSize: CONFIG.MAX_CACHE_SIZE,
        defaultTTL: `${CONFIG.DEFAULT_TTL_MS / 1000 / 60 / 60}h`,
        persistentTTL: `${CONFIG.PERSISTENT_TTL_MS / 1000 / 60 / 60 / 24}d`
      }
    };
  }

  /**
   * Cleanup resources before destruction
   * Call when cache is no longer needed
   */
  destroy() {
    this.cleanup();

    // Final sync before destruction
    this.syncToStorage().catch(error => {
      console.error('PermissionCache: Final sync failed:', error);
    });

    console.log('PermissionCache: Destroyed');
  }
}

// Export configuration for testing
export { CONFIG as PERMISSION_CACHE_CONFIG };
