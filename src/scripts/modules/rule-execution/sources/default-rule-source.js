/**
 * Default Rule Source
 *
 * @fileoverview Wraps existing defaultRules from chrome.storage.
 * These are the built-in CSS selector rules shipped with the extension.
 *
 * @module default-rule-source
 */

import { IDomRuleSource } from './i-dom-rule-source.js';
import { safeStorageGet } from '@script-utils/chrome-api-safe.js';

/**
 * Source for default built-in CSS selector rules
 * @extends IDomRuleSource
 */
export class DefaultRuleSource extends IDomRuleSource {
  constructor() {
    super();
    this.cachedRules = null;
    this.cacheTime = 0;
    this.cacheTTL = 60000; // 1 minute cache (rules rarely change)
  }

  /**
   * Fetch default rules from chrome.storage
   * @returns {Promise<Rule[]>} Array of default rules
   */
  async fetchRules() {
    // Use short-term cache to reduce storage API calls
    const now = Date.now();
    if (this.cachedRules && (now - this.cacheTime) < this.cacheTTL) {
      return this.cachedRules;
    }

    try {
      const result = await safeStorageGet(['defaultRules']);
      this.cachedRules = result.defaultRules || [];
      this.cacheTime = now;
      return this.cachedRules;
    } catch (error) {
      console.error('DefaultRuleSource: Failed to fetch rules:', error);
      // Return cached rules if available, empty array otherwise
      return this.cachedRules || [];
    }
  }

  /**
   * @returns {string} Human-readable source name
   */
  getName() {
    return 'Default Selector Rules';
  }

  /**
   * @returns {'selector'} Executor type - uses CSS selectors
   */
  getExecutorType() {
    return 'selector';
  }

  /**
   * @returns {number} Update interval (0 = manual updates only via settings)
   */
  getUpdateInterval() {
    return 0; // No automatic updates - managed by background script
  }

  /**
   * @returns {string} Storage key
   */
  getCacheKey() {
    return 'defaultRules';
  }

  /**
   * Invalidate cache (call when rules are updated)
   */
  invalidateCache() {
    this.cachedRules = null;
    this.cacheTime = 0;
  }
}
