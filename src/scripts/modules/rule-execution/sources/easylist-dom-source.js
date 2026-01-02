/**
 * EasyList DOM Rule Source
 *
 * @fileoverview Fetches EasyList cosmetic filter rules for DOM element hiding.
 * Uses easylist_general_hide.txt which contains ~13,000 CSS selectors.
 * Implements 7-day TTL caching with graceful degradation on fetch failure.
 *
 * @module easylist-dom-source
 */

import { IDomRuleSource } from './i-dom-rule-source.js';
import { safeStorageGet, safeStorageSet } from '@script-utils/chrome-api-safe.js';

/**
 * EasyList URL for cosmetic (DOM hiding) rules
 * @constant {string}
 */
const EASYLIST_URL = 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_general_hide.txt';

/**
 * Cache TTL: 7 days in milliseconds
 * @constant {number}
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cache schema version for migration handling
 * @constant {string}
 */
const CACHE_VERSION = '1.0';

/**
 * Source for EasyList cosmetic filter rules (DOM hiding)
 * @extends IDomRuleSource
 */
export class EasyListDomSource extends IDomRuleSource {
  constructor() {
    super();
    // In-memory cache for faster access within session
    this.memoryCachedRules = null;
    this.memoryCacheTime = 0;
    this.memoryCacheTTL = 60000; // 1 minute memory cache
  }

  /**
   * Fetch EasyList rules with 7-day cache
   * @returns {Promise<string[]>} Array of raw EasyList lines
   */
  async fetchRules() {
    // Check memory cache first (fast path)
    const now = Date.now();
    if (this.memoryCachedRules && (now - this.memoryCacheTime) < this.memoryCacheTTL) {
      return this.memoryCachedRules;
    }

    try {
      // Check storage cache
      const cached = await this.getCachedRules();

      if (cached && this.isCacheValid(cached)) {
        // Cache is valid, use it
        this.memoryCachedRules = cached.rules;
        this.memoryCacheTime = now;
        return cached.rules;
      }

      // Cache expired or missing - fetch fresh rules
      const freshRules = await this.fetchFromNetwork();

      // Update storage cache
      await this.setCachedRules(freshRules);

      // Update memory cache
      this.memoryCachedRules = freshRules;
      this.memoryCacheTime = now;

      return freshRules;
    } catch (error) {
      console.error('EasyListDomSource: Failed to fetch rules:', error);

      // Graceful degradation: try to return expired cache
      try {
        const cached = await this.getCachedRules();
        if (cached && cached.rules && cached.rules.length > 0) {
          console.warn('EasyListDomSource: Using expired cache due to fetch failure');
          this.memoryCachedRules = cached.rules;
          this.memoryCacheTime = now;
          return cached.rules;
        }
      } catch (cacheError) {
        console.error('EasyListDomSource: Failed to read expired cache:', cacheError);
      }

      // No cache available, return empty
      return [];
    }
  }

  /**
   * Fetch rules from GitHub
   * @private
   * @returns {Promise<string[]>} Array of raw EasyList lines
   */
  async fetchFromNetwork() {
    const response = await fetch(EASYLIST_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch EasyList: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // Split into lines and filter out empty lines (keep all for parser to handle)
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    console.log(`EasyListDomSource: Fetched ${lines.length} rules from network`);

    return lines;
  }

  /**
   * Get cached rules from chrome.storage.local
   * @private
   * @returns {Promise<{rules: string[], lastFetched: number, version: string}|null>}
   */
  async getCachedRules() {
    const result = await safeStorageGet(['easylistDomRules']);
    return result.easylistDomRules || null;
  }

  /**
   * Save rules to chrome.storage.local
   * @private
   * @param {string[]} rules - Raw EasyList lines
   */
  async setCachedRules(rules) {
    await safeStorageSet({
      easylistDomRules: {
        rules,
        lastFetched: Date.now(),
        version: CACHE_VERSION
      }
    });
  }

  /**
   * Check if cached data is still valid
   * @private
   * @param {{rules: string[], lastFetched: number, version: string}} cached
   * @returns {boolean}
   */
  isCacheValid(cached) {
    if (!cached || !cached.rules || !cached.lastFetched) {
      return false;
    }

    // Check version for migration
    if (cached.version !== CACHE_VERSION) {
      return false;
    }

    // Check TTL
    const age = Date.now() - cached.lastFetched;
    return age < CACHE_TTL_MS;
  }

  /**
   * @returns {string} Human-readable source name
   */
  getName() {
    return 'EasyList DOM Rules';
  }

  /**
   * @returns {'hybrid'} Executor type - uses hybrid declarative-procedural engine
   */
  getExecutorType() {
    return 'hybrid';
  }

  /**
   * @returns {number} Update interval in minutes (7 days)
   */
  getUpdateInterval() {
    return 10080; // 7 days in minutes
  }

  /**
   * @returns {string} Storage key for caching
   */
  getCacheKey() {
    return 'easylistDomRules';
  }

  /**
   * Invalidate all caches (memory and storage)
   */
  invalidateCache() {
    this.memoryCachedRules = null;
    this.memoryCacheTime = 0;
  }

  /**
   * Force refresh from network (used by alarm handler)
   * @returns {Promise<string[]>} Fresh rules
   */
  async forceRefresh() {
    this.invalidateCache();

    try {
      const freshRules = await this.fetchFromNetwork();
      await this.setCachedRules(freshRules);

      this.memoryCachedRules = freshRules;
      this.memoryCacheTime = Date.now();

      return freshRules;
    } catch (error) {
      console.error('EasyListDomSource: Force refresh failed:', error);
      throw error;
    }
  }

  /**
   * Get cache status information
   * @returns {Promise<{lastFetched: number|null, ruleCount: number, isExpired: boolean}>}
   */
  async getCacheStatus() {
    try {
      const cached = await this.getCachedRules();

      if (!cached) {
        return {
          lastFetched: null,
          ruleCount: 0,
          isExpired: true
        };
      }

      return {
        lastFetched: cached.lastFetched,
        ruleCount: cached.rules?.length || 0,
        isExpired: !this.isCacheValid(cached)
      };
    } catch (error) {
      return {
        lastFetched: null,
        ruleCount: 0,
        isExpired: true
      };
    }
  }
}
