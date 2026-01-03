/**
 * Element Removal Module - DOM element removal with automatic memory management
 *
 * @fileoverview Provides DOM element removal with WeakSet-based memory leak prevention,
 * statistics tracking, and automatic cleanup. Implements singleton pattern with
 * proper lifecycle management.
 *
 * @example
 * // Remove single element
 * ElementRemover.removeElement(adElement, 'ad-rule-123');
 *
 * @example
 * // Batch removal (typical usage from selector-executor.js)
 * const elements = document.querySelectorAll('.ad');
 * const removed = ElementRemover.batchRemove(
 *   Array.from(elements),
 *   'ad-removal-rule',
 *   ElementRemover.REMOVAL_STRATEGIES.REMOVE
 * );
 * Logger.info('ElementRemoval', 'Removed elements', { count: removed });
 *
 * @example
 * // Cleanup (called by content.js destructor)
 * ElementRemover.cleanup();
 *
 * @module ElementRemover
 * @since 1.0.0
 * @author OriginalUI Team
 */
import Logger from '@script-utils/logger.js';

/**
 * ElementRemover class providing comprehensive DOM element removal strategies
 * @class
 */
export class ElementRemover {
  /**
   * Available removal strategy for DOM elements
   * @readonly
   * @enum {string}
   * @property {string} REMOVE - Remove element completely from DOM (only supported strategy)
   */
  static REMOVAL_STRATEGIES = {
    REMOVE: 'remove'
  };

  /**
   * Cleanup configuration for automatic statistics reset
   * @readonly
   * @type {Object}
   * @property {number} MAX_STATS_AGE_MS - Maximum age before auto-reset (5 minutes)
   * @property {number} CLEANUP_CHECK_INTERVAL_MS - Frequency of cleanup checks (30 seconds)
   */
  static CLEANUP_CONFIG = {
    MAX_STATS_AGE_MS: 300000,        // 5 minutes - prevents stats accumulating indefinitely
    CLEANUP_CHECK_INTERVAL_MS: 30000 // 30 seconds - balance between accuracy and performance
  };

  /**
   * WeakSet for automatic garbage collection of processed elements.
   * Elements are automatically cleaned up when they're garbage collected.
   * @private
   * @type {WeakSet<HTMLElement>}
   */
  static processedElements = new WeakSet();
  
  /**
   * Statistics tracking for element removal operations
   * @private
   * @type {Object}
   * @property {number} totalRemoved - Total count of removed elements
   * @property {number} lastReset - Timestamp of last stats reset (for auto-reset)
   */
  static removalStats = {
    totalRemoved: 0,
    lastReset: Date.now()
  };
  
  /**
   * Timestamp of last cleanup check
   * @private
   * @type {number}
   */
  static lastCleanupCheck = Date.now();

  /**
   * Validate removal strategy
   * @param {string} strategy - Strategy to validate
   * @returns {boolean} True if valid
   * @throws {Error} If strategy is invalid
   */
  static validateStrategy(strategy) {
    // Allow undefined/null (will default to REMOVE)
    if (strategy === undefined || strategy === null) {
      return true;
    }

    // Must be string
    if (typeof strategy !== 'string') {
      throw new Error(
        `ElementRemover: Strategy must be a string, got ${typeof strategy}`
      );
    }

    // Must be REMOVE
    if (strategy !== this.REMOVAL_STRATEGIES.REMOVE) {
      throw new Error(
        `ElementRemover: Unsupported removal strategy "${strategy}". ` +
        `Only "${this.REMOVAL_STRATEGIES.REMOVE}" is supported.`
      );
    }

    return true;
  }

  /**
   * Remove element from DOM
   * @param {HTMLElement} element - DOM element to remove
   * @param {string} ruleId - Unique identifier of the rule that triggered removal
   * @param {string} [strategy=REMOVAL_STRATEGIES.REMOVE] - Removal strategy (only REMOVE supported)
   * @returns {boolean} True if removal was successful, false if already processed or invalid
   * @throws {Error} If strategy is provided but not REMOVE
   *
   * @example
   * // Remove an advertisement element
   * const success = ElementRemover.removeElement(adElement, 'ad-block-rule-1');
   *
   * @example
   * // Explicit strategy (required by selector-executor.js)
   * ElementRemover.removeElement(element, 'rule-5', ElementRemover.REMOVAL_STRATEGIES.REMOVE);
   */
  static removeElement(element, ruleId, strategy = this.REMOVAL_STRATEGIES.REMOVE) {
    if (!element || this.processedElements.has(element)) {
      return false;
    }

    // Validate strategy (throws on invalid input)
    this.validateStrategy(strategy);

    // Periodic cleanup check
    this.performPeriodicCleanupCheck();

    // Mark element as processed using WeakSet for automatic memory management
    this.processedElements.add(element);

    // Remove element from DOM
    try {
      this.applyRemovalStrategy(element);
      this.removalStats.totalRemoved++;
    } catch (error) {
      Logger.warn('ElementRemoval', 'Error during element removal', error);
      return false;
    }

    return true;
  }
  
  /**
   * Apply removal strategy by removing element from DOM
   * @param {HTMLElement} element - Element to remove
   */
  static applyRemovalStrategy(element) {
    element.remove();
  }
  
  /**
   * Check if element was already processed
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - True if already processed
   */
  static isProcessed(element) {
    return this.processedElements.has(element);
  }

  /**
   * Batch remove multiple elements
   * @param {HTMLElement[]} elements - Array of elements to remove
   * @param {string} ruleId - ID of the rule triggering removal
   * @param {string} [strategy=REMOVAL_STRATEGIES.REMOVE] - Removal strategy (only REMOVE supported)
   * @returns {number} Count of successfully removed elements
   * @throws {Error} If strategy is provided but not REMOVE
   *
   * @example
   * // Typical usage from selector-executor.js
   * const removed = ElementRemover.batchRemove(
   *   Array.from(elements),
   *   rule.id,
   *   ElementRemover.REMOVAL_STRATEGIES.REMOVE
   * );
   */
  static batchRemove(elements, ruleId, strategy = this.REMOVAL_STRATEGIES.REMOVE) {
    // Validate strategy once at batch level (throws on invalid input)
    this.validateStrategy(strategy);

    let count = 0;

    elements.forEach(element => {
      if (this.removeElement(element, ruleId, strategy)) {
        count++;
      }
    });

    return count;
  }

  /**
   * Perform periodic cleanup checks
   */
  static performPeriodicCleanupCheck() {
    const currentTime = Date.now();
    const timeSinceLastCheck = currentTime - this.lastCleanupCheck;

    // Check every 30 seconds
    if (timeSinceLastCheck > this.CLEANUP_CONFIG.CLEANUP_CHECK_INTERVAL_MS) {
      this.lastCleanupCheck = currentTime;

      const cacheAge = currentTime - this.removalStats.lastReset;
      if (cacheAge > this.CLEANUP_CONFIG.MAX_STATS_AGE_MS) {
        Logger.info('ElementRemoval', 'Auto-resetting ElementRemover stats due to age');
        this.resetStats();
      }
    }
  }
  
  /**
   * Reset removal statistics
   */
  static resetStats() {
    this.removalStats = {
      totalRemoved: 0,
      lastReset: Date.now()
    };
  }
  
  /**
   * Cleanup method for memory management
   * Resets WeakSet and statistics. Called by content.js destructor.
   */
  static cleanup() {
    Logger.info('ElementRemovalCleanup', 'Starting ElementRemover cleanup...');

    const preCleanupStats = { ...this.removalStats };

    // Create new WeakSet to release any references
    this.processedElements = new WeakSet();

    // Reset all statistics
    this.resetStats();

    // Update cleanup timing
    this.lastCleanupCheck = Date.now();

    Logger.info('ElementRemovalCleanup', 'ElementRemover cleanup completed', {
      beforeCleanup: preCleanupStats,
      newWeakSetCreated: true,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      stats: preCleanupStats
    };
  }
}
