/**
 * Mutation Watcher
 *
 * @fileoverview Debounced MutationObserver for catching dynamically injected ads.
 * Uses requestAnimationFrame to batch mutations and avoid performance bottlenecks.
 *
 * Key strategies:
 * 1. Buffer mutations and process in batches
 * 2. Debounce using requestAnimationFrame
 * 3. Deduplicate with WeakSet to avoid reprocessing
 *
 * @module mutation-watcher
 */

import Logger from "@script-utils/logger.js";

/**
 * Debounced MutationObserver for dynamic content
 */
export class MutationWatcher {
  /**
   * @param {TokenIndexer} tokenIndex - Token indexer for lookups
   * @param {DomScanner} scanner - Scanner for processing elements
   * @param {Object} options - Watcher options
   */
  constructor(tokenIndex, scanner, options = {}) {
    /**
     * Token indexer for O(1) lookups
     * @type {TokenIndexer}
     */
    this.tokenIndex = tokenIndex;

    /**
     * DOM scanner for processing elements
     * @type {DomScanner}
     */
    this.scanner = scanner;

    /**
     * Watcher options
     * @type {Object}
     */
    this.options = {
      subtree: true,           // Watch entire subtree
      childList: true,         // Watch for added/removed nodes
      attributes: true,        // Watch for attribute changes
      attributeFilter: ['class', 'id'], // Only watch class and id
      ...options
    };

    /**
     * MutationObserver instance
     * @type {MutationObserver|null}
     */
    this.observer = null;

    /**
     * Pending mutations buffer
     * @type {MutationRecord[]}
     */
    this.pendingMutations = [];

    /**
     * Flag for debounce scheduling
     * @type {boolean}
     */
    this.scheduled = false;

    /**
     * WeakSet for deduplication
     * @type {WeakSet}
     */
    this.seen = new WeakSet();

    /**
     * Cumulative statistics
     * @type {{removed: number, hidden: number, mutations: number}}
     */
    this.stats = { removed: 0, hidden: 0, mutations: 0 };

    /**
     * Callback for external stat updates
     * @type {Function|null}
     */
    this.onStatsUpdate = null;
  }

  /**
   * Start watching for mutations
   * @param {Element} target - Element to observe (default: document.body)
   */
  start(target = document.body) {
    if (this.observer) {
      Logger.warn("RuleExecution:MutationWatcher", "Already running");
      return;
    }

    if (!target) {
      Logger.error("RuleExecution:MutationWatcher", "No target element");
      return;
    }

    this.observer = new MutationObserver(mutations => {
      this.handleMutations(mutations);
    });

    this.observer.observe(target, {
      childList: this.options.childList,
      subtree: this.options.subtree,
      attributes: this.options.attributes,
      attributeFilter: this.options.attributeFilter
    });

    Logger.info("RuleExecution:MutationWatcher", "Started observing");
  }

  /**
   * Handle incoming mutations (buffer and schedule)
   * @private
   * @param {MutationRecord[]} mutations
   */
  handleMutations(mutations) {
    // Add to buffer
    this.pendingMutations.push(...mutations);
    this.stats.mutations += mutations.length;

    // Schedule processing if not already scheduled
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => {
        this.processMutations();
      });
    }
  }

  /**
   * Process buffered mutations
   * @private
   */
  processMutations() {
    const mutations = this.pendingMutations;
    this.pendingMutations = [];
    this.scheduled = false;

    if (mutations.length === 0) {
      return;
    }

    let localRemoved = 0;
    let localHidden = 0;

    for (const mutation of mutations) {
      // Handle added nodes
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const result = this.processNode(node);
            localRemoved += result.removed;
            localHidden += result.hidden;
          }
        }
      }

      // Handle attribute changes
      if (mutation.type === 'attributes') {
        const node = mutation.target;
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Reset seen status for attribute changes
          // Element might now match a rule after class/id change
          this.seen.delete(node);
          const result = this.processNode(node);
          localRemoved += result.removed;
          localHidden += result.hidden;
        }
      }
    }

    // Update cumulative stats
    if (localRemoved > 0 || localHidden > 0) {
      this.stats.removed += localRemoved;
      this.stats.hidden += localHidden;

      // Call external callback if set
      if (this.onStatsUpdate) {
        this.onStatsUpdate({
          removed: localRemoved,
          hidden: localHidden,
          total: this.stats
        });
      }
    }
  }

  /**
   * Process a single node (check and scan)
   * @private
   * @param {Element} node
   * @returns {{removed: number, hidden: number}}
   */
  processNode(node) {
    // Skip if already processed
    if (this.seen.has(node)) {
      return { removed: 0, hidden: 0 };
    }

    // Skip if already blocked
    if (node.hasAttribute && node.hasAttribute('data-content-blocked')) {
      return { removed: 0, hidden: 0 };
    }

    // Mark as seen
    this.seen.add(node);

    // Use scanner to process element and descendants
    return this.scanner.scanElement(node);
  }

  /**
   * Stop watching for mutations
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear buffer
    this.pendingMutations = [];
    this.scheduled = false;

    Logger.info("RuleExecution:MutationWatcher", "Stopped");
  }

  /**
   * Get cumulative statistics
   * @returns {{removed: number, hidden: number, mutations: number}}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { removed: 0, hidden: 0, mutations: 0 };
  }

  /**
   * Check if watcher is active
   * @returns {boolean}
   */
  isActive() {
    return this.observer !== null;
  }

  /**
   * Set callback for stat updates
   * @param {Function} callback - Callback(stats) called when elements are blocked
   */
  setStatsCallback(callback) {
    this.onStatsUpdate = callback;
  }
}
