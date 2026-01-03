/**
 * Custom Rule Source
 *
 * @fileoverview Wraps existing customRules from chrome.storage.
 * These are user-created CSS selector rules defined in settings.
 *
 * @module custom-rule-source
 */

import Logger from "@script-utils/logger.js";
import { IDomRuleSource } from "./i-dom-rule-source.js";
import { safeStorageGet } from "@script-utils/chrome-api-safe.js";

/**
 * Source for user-defined custom CSS selector rules
 * @extends IDomRuleSource
 */
export class CustomRuleSource extends IDomRuleSource {
  constructor() {
    super();
    this.cachedRules = null;
    this.cacheTime = 0;
    this.cacheTTL = 30000; // 30 second cache (custom rules change more frequently)
  }

  /**
   * Fetch custom rules from chrome.storage
   * @returns {Promise<Rule[]>} Array of custom rules
   */
  async fetchRules() {
    // Use short-term cache to reduce storage API calls
    const now = Date.now();
    if (this.cachedRules && (now - this.cacheTime) < this.cacheTTL) {
      return this.cachedRules;
    }

    try {
      const result = await safeStorageGet(['customRules']);
      this.cachedRules = result.customRules || [];
      this.cacheTime = now;
      return this.cachedRules;
    } catch (error) {
      Logger.error(
        "RuleExecution:CustomRuleSource",
        "Failed to fetch rules",
        error
      );
      // Return cached rules if available, empty array otherwise
      return this.cachedRules || [];
    }
  }

  /**
   * @returns {string} Human-readable source name
   */
  getName() {
    return 'Custom Selector Rules';
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
    return 0; // No automatic updates - managed by user via settings
  }

  /**
   * @returns {string} Storage key
   */
  getCacheKey() {
    return 'customRules';
  }

  /**
   * Invalidate cache (call when rules are updated)
   */
  invalidateCache() {
    this.cachedRules = null;
    this.cacheTime = 0;
  }
}
