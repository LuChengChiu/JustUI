/**
 * Interface for DOM Rule Sources
 *
 * @fileoverview Base interface that all DOM rule sources must implement.
 * Follows the same pattern as network-blocking sources for consistency.
 *
 * @example
 * class MyRuleSource extends IDomRuleSource {
 *   async fetchRules() { return []; }
 *   getName() { return 'My Rules'; }
 *   getExecutorType() { return 'selector'; }
 *   getUpdateInterval() { return 0; }
 *   getCacheKey() { return 'myRules'; }
 * }
 */

/**
 * Base interface for all DOM rule sources
 * @interface
 */
export class IDomRuleSource {
  /**
   * Fetch rules from source (storage, network, etc.)
   * @returns {Promise<any[]>} Array of rules in source-specific format
   * @throws {Error} Must be implemented by subclass
   */
  async fetchRules() {
    throw new Error('IDomRuleSource.fetchRules() must be implemented by subclass');
  }

  /**
   * Get human-readable name for this source
   * @returns {string} Source name (e.g., "Default Selector Rules")
   */
  getName() {
    throw new Error('IDomRuleSource.getName() must be implemented by subclass');
  }

  /**
   * Get executor type for this source
   * @returns {'selector'|'domain-pattern'} Executor type
   */
  getExecutorType() {
    throw new Error('IDomRuleSource.getExecutorType() must be implemented by subclass');
  }

  /**
   * Get update interval in minutes (0 = manual only)
   * @returns {number} Minutes between automatic updates
   */
  getUpdateInterval() {
    throw new Error('IDomRuleSource.getUpdateInterval() must be implemented by subclass');
  }

  /**
   * Get cache key for chrome.storage
   * @returns {string} Storage key for caching rules
   */
  getCacheKey() {
    throw new Error('IDomRuleSource.getCacheKey() must be implemented by subclass');
  }
}
