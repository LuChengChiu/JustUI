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

import Logger from './logger.js';
import { isExtensionContextValid, safeStorageGet, safeStorageSet } from './chrome-api-safe.js';
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
 * Doubly-Linked List Node for LRU cache
 * @private
 * @class
 */
class CacheNode {
  /**
   * Create a cache node
   * @param {string} key - Cache key for reverse lookup during eviction
   * @param {CacheEntry} value - Full cache entry object
   */
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

/**
 * Permission Cache Class
 *
 * Manages user navigation permission decisions with in-memory + persistent storage.
 * Uses a hybrid Doubly-Linked List + Hash Map for O(1) lookups and LRU eviction.
 *
 * Architecture:
 * - Hash Map: cacheKey → CacheNode (O(1) lookup)
 * - Doubly-Linked List: maintains access order (head = MRU, tail = LRU)
 * - Eviction: O(1) removal of tail node (least recently used)
 */
export class PermissionCache {
  constructor() {
    // Hash Map for O(1) lookup: cacheKey → CacheNode
    this.cache = new Map();

    // Doubly-linked list sentinels for LRU ordering
    this.head = new CacheNode(null, null);  // MRU (Most Recently Used)
    this.tail = new CacheNode(null, null);  // LRU (Least Recently Used)
    this.head.next = this.tail;
    this.tail.prev = this.head;

    // Size tracking (separate from Map.size for clarity)
    this.size = 0;

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
   * Add node to head (mark as most recently used)
   * @private
   * @param {CacheNode} node - Node to add
   */
  _addToHead(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Add node to tail (mark as least recently used)
   * Used during storage restoration to preserve LRU order
   * @private
   * @param {CacheNode} node - Node to add
   */
  _addToTail(node) {
    node.prev = this.tail.prev;
    node.next = this.tail;
    this.tail.prev.next = node;
    this.tail.prev = node;
  }

  /**
   * Remove node from linked list
   * @private
   * @param {CacheNode} node - Node to remove
   */
  _removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    // Nullify pointers to enable garbage collection
    node.prev = null;
    node.next = null;
  }

  /**
   * Move node to head (LRU promotion)
   * @private
   * @param {CacheNode} node - Node to promote
   */
  _moveToHead(node) {
    this._removeNode(node);
    this._addToHead(node);
  }

  /**
   * Remove and return tail node (least recently used)
   * @private
   * @returns {CacheNode|null} The removed node, or null if list is empty
   */
  _removeTail() {
    const node = this.tail.prev;
    if (node === this.head) {
      return null; // Empty list
    }
    this._removeNode(node);
    return node;
  }

  /**
   * Validate DLL integrity (development mode only)
   * @private
   * @throws {Error} If DLL invariants are violated
   */
  _validateDLL() {
    // Only run in development mode (check for common dev indicators)
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      return;
    }

    // 1. Validate sentinel links
    if (this.head.prev !== null) {
      throw new Error('DLL Integrity Error: head.prev should be null');
    }
    if (this.tail.next !== null) {
      throw new Error('DLL Integrity Error: tail.next should be null');
    }

    // 2. Count nodes and validate bidirectional links
    let count = 0;
    let current = this.head.next;
    const visited = new Set();

    while (current !== this.tail) {
      // Check for circular references
      if (visited.has(current)) {
        throw new Error('DLL Integrity Error: Circular reference detected');
      }
      visited.add(current);

      // Validate bidirectional links
      if (current.next.prev !== current) {
        throw new Error('DLL Integrity Error: Broken bidirectional link (forward)');
      }
      if (current.prev.next !== current) {
        throw new Error('DLL Integrity Error: Broken bidirectional link (backward)');
      }

      // Validate node is in Map
      if (!this.cache.has(current.key)) {
        throw new Error(`DLL Integrity Error: Node with key "${current.key}" not in Map`);
      }

      count++;
      current = current.next;
    }

    // 3. Validate node count matches this.size
    if (count !== this.size) {
      throw new Error(`DLL Integrity Error: Node count (${count}) != this.size (${this.size})`);
    }

    // 4. Validate Map size matches this.size
    if (this.cache.size !== this.size) {
      throw new Error(`DLL Integrity Error: Map.size (${this.cache.size}) != this.size (${this.size})`);
    }

    // 5. Validate all Map entries are in DLL
    for (const [key, node] of this.cache.entries()) {
      if (!visited.has(node)) {
        throw new Error(`DLL Integrity Error: Map entry "${key}" not found in DLL`);
      }
    }
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

    const node = this.cache.get(key);  // Returns CacheNode
    if (!node) {
      this.stats.cacheMisses++;
      return null;
    }

    // Check expiration
    if (Date.now() > node.value.expiresAt) {
      this._removeNode(node);  // Remove from DLL
      this.cache.delete(key);  // Remove from Map
      this.size--;             // Decrement size
      this.stats.cacheMisses++;
      return null;
    }

    // LRU: Mark as recently used
    this._moveToHead(node);

    this.stats.cacheHits++;
    return {
      decision: node.value.decision,
      isExpired: false,
      metadata: node.value.metadata
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
      Logger.warn('CacheStorageFallbackFailed', 'Storage fallback failed', { error });
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
      Logger.warn('CacheInvalidOrigins', 'Skipping cache write - invalid origins', {
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

    const existingNode = this.cache.get(key);

    if (existingNode) {
      // Update existing entry and move to head
      existingNode.value = entry;
      this._moveToHead(existingNode);
    } else {
      // Create new node and add to head
      const newNode = new CacheNode(key, entry);
      this.cache.set(key, newNode);
      this._addToHead(newNode);
      this.size++;
    }

    this.stats.totalEntries = this.size;

    // Enforce size limit (now O(1) amortized)
    this.enforceSizeLimit();

    // Debounced sync to storage
    this.scheduleStorageSync();

    // Validate DLL integrity (development mode only)
    this._validateDLL();
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
    const keysToRemove = [];

    // Collect expired keys first (avoid iterator invalidation)
    for (const [key, node] of this.cache.entries()) {
      if (now > node.value.expiresAt) {
        keysToRemove.push({ key, node });
      }
    }

    // Then remove them
    for (const { key, node } of keysToRemove) {
      this._removeNode(node);  // Remove from DLL
      this.cache.delete(key);  // Remove from Map
      this.size--;
    }

    const removed = keysToRemove.length;

    if (removed > 0) {
      this.stats.totalEntries = this.size;
      Logger.info('CacheCleanExpired', 'Cleaned expired entries', { removed });
    }

    // Validate DLL integrity (development mode only)
    this._validateDLL();

    return removed;
  }

  /**
   * Enforce maximum cache size using LRU eviction
   * Evicts least recently used entries when size exceeds limit
   *
   * @private
   */
  enforceSizeLimit() {
    // Clean expired first (free space without evicting valid entries)
    this.cleanExpired();

    if (this.size <= CONFIG.MAX_CACHE_SIZE) {
      return; // Within limit
    }

    // Evict LRU entries (O(1) per eviction)
    let evicted = 0;
    while (this.size > CONFIG.MAX_CACHE_SIZE) {
      const node = this._removeTail();  // O(1) - remove from DLL
      if (!node) {
        break; // Empty list (shouldn't happen)
      }

      this.cache.delete(node.key);  // O(1) - remove from Map
      this.size--;
      this.stats.evictions++;
      evicted++;
    }

    this.stats.totalEntries = this.size;

    if (evicted > 0) {
      Logger.info('CacheLRUEviction', 'Evicted LRU entries', { evicted, sizeLimit: CONFIG.MAX_CACHE_SIZE });
    }

    // Validate DLL integrity after evictions (development mode only)
    this._validateDLL();
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
          Logger.error('CacheScheduledSyncFailed', 'Scheduled sync failed', error);
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
      // Convert linked list to object in LRU order (head → tail)
      const entries = {};
      let current = this.head.next;

      while (current !== this.tail) {
        entries[current.key] = current.value;
        current = current.next;
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

      Logger.info('CacheSyncedToStorage', 'Synced entries to storage', { entries: this.size });
    } catch (error) {
      Logger.error('CacheSyncFailed', 'Failed to sync to storage', error);
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
        Logger.info('CacheNoValidData', 'No valid cache data found in storage');
        return;
      }

      // Load entries and build DLL
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

        // Create node and add to cache
        const node = new CacheNode(normalizedKey, entry);
        this.cache.set(normalizedKey, node);
        this._addToTail(node);  // Add to tail to preserve storage order (MRU -> LRU)
        this.size++;
        loaded++;
      }

      // Restore statistics
      if (data.stats) {
        this.stats = { ...this.stats, ...data.stats };
      }

      this.stats.totalEntries = this.size;

      Logger.info('CacheLoadedFromStorage', 'Loaded entries from storage', {
        loaded,
        expired,
        invalid,
        normalized
      });
    } catch (error) {
      Logger.error('CacheLoadFailed', 'Failed to load from storage', error);
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

    Logger.info('CacheAutoCleanupEnabled', 'Auto-cleanup enabled', {
      intervalMinutes: CONFIG.CLEANUP_INTERVAL_MS / 1000 / 60
    });
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
      Logger.error('CacheFinalSyncFailedUnload', 'Final sync failed on unload', error);
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
      Logger.info('CacheAutoCleanupDisabled', 'Auto-cleanup disabled');
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

    // Reset linked list to empty state
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.size = 0;

    this.stats = {
      totalEntries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      evictions: 0,
      storageSync: 0,
      lastSyncTime: 0
    };

    Logger.info('CacheCleared', 'Cache cleared');

    // Validate DLL integrity (development mode only)
    this._validateDLL();

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
      cacheSize: this.size,
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
      Logger.error('CacheFinalSyncFailed', 'Final sync failed', error);
    });

    Logger.info('CacheDestroyed', 'Permission cache destroyed');
  }
}

// Export configuration for testing
export { CONFIG as PERMISSION_CACHE_CONFIG };
