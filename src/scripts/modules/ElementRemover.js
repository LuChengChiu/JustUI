/**
 * Element Removal Module - Handles DOM element removal strategies with comprehensive cleanup management
 * 
 * @fileoverview Provides multiple DOM element removal strategies with automatic memory management,
 * statistics tracking, and comprehensive cleanup capabilities. Implements singleton pattern with
 * proper lifecycle management and WeakSet-based memory leak prevention.
 * 
 * @example
 * // Basic element removal
 * ElementRemover.removeElement(element, 'rule-123', ElementRemover.REMOVAL_STRATEGIES.HIDE);
 * 
 * @example
 * // Batch removal with statistics
 * const elements = document.querySelectorAll('.ad');
 * ElementRemover.removeElements(elements, 'bulk-remove', { strategy: 'hide', preserveLayout: true });
 * 
 * @example
 * // Cleanup and statistics
 * ElementRemover.cleanup();
 * const stats = ElementRemover.getRemovalStats();
 * console.log(`Removed ${stats.totalRemoved} elements`);
 * 
 * @module ElementRemover
 * @since 1.0.0
 * @author JustUI Team
 */

/**
 * ElementRemover class providing comprehensive DOM element removal strategies
 * @class
 */
export class ElementRemover {
  /**
   * Available removal strategies for DOM elements
   * @readonly
   * @enum {string}
   * @property {string} HIDE - Hide element using CSS display:none
   * @property {string} REMOVE - Remove element completely from DOM
   * @property {string} NEUTRALIZE - Neutralize element by removing attributes and content
   */
  static REMOVAL_STRATEGIES = {
    HIDE: 'hide',
    REMOVE: 'remove',
    NEUTRALIZE: 'neutralize'
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
   * @property {number} lastReset - Timestamp of last stats reset
   * @property {Object} strategyCounts - Count per strategy type
   */
  static removalStats = {
    totalRemoved: 0,
    lastReset: Date.now(),
    strategyCounts: {
      hide: 0,
      remove: 0,
      neutralize: 0
    }
  };
  
  /**
   * Cleanup enforcement configuration
   * @private
   * @type {Object}
   * @property {number} maxCacheAge - Maximum age for cached data (5 minutes)
   * @property {Set} cleanupCallbacks - Registered cleanup callbacks
   * @property {number} lastCleanupCheck - Timestamp of last cleanup check
   */
  static maxCacheAge = 300000; // 5 minutes
  static cleanupCallbacks = new Set();
  static lastCleanupCheck = Date.now();

  /**
   * Remove element from DOM using the specified strategy
   * @param {HTMLElement} element - DOM element to remove/modify
   * @param {string} ruleId - Unique identifier of the rule that triggered this removal
   * @param {string} [strategy=REMOVAL_STRATEGIES.REMOVE] - Removal strategy to apply
   * @returns {boolean} True if removal was successful, false if element was already processed
   * @throws {Error} If element parameter is not a valid HTMLElement
   * 
   * @example
   * // Hide an advertisement element
   * const success = ElementRemover.removeElement(adElement, 'ad-block-rule-1', 'hide');
   * 
   * @example
   * // Remove tracking pixel completely
   * ElementRemover.removeElement(trackerElement, 'tracker-rule-5', 'remove');
   */
  static removeElement(element, ruleId, strategy = this.REMOVAL_STRATEGIES.REMOVE) {
    if (!element || this.processedElements.has(element)) {
      return false;
    }

    // Periodic cleanup check
    this.performPeriodicCleanupCheck();

    // Mark element as processed using WeakSet for automatic memory management
    this.processedElements.add(element);
    
    // Keep debugging attributes for development (these will be GC'd with element)
    try {
      element.setAttribute('data-justui-removed', ruleId);
      element.setAttribute('data-justui-timestamp', Date.now());
      element.setAttribute('data-justui-strategy', strategy);
    } catch (error) {
      // Element might be in a state where attributes can't be set
      console.debug('JustUI: Could not set debug attributes on element:', error);
    }

    let removalSuccess = false;
    
    try {
      switch (strategy) {
        case this.REMOVAL_STRATEGIES.HIDE:
          this.applyHideStrategy(element);
          this.removalStats.strategyCounts.hide++;
          removalSuccess = true;
          break;

        case this.REMOVAL_STRATEGIES.NEUTRALIZE:
          this.neutralizeElement(element);
          this.removalStats.strategyCounts.neutralize++;
          removalSuccess = true;
          break;

        case this.REMOVAL_STRATEGIES.REMOVE:
        default:
          this.applyRemovalStrategy(element);
          this.removalStats.strategyCounts.remove++;
          removalSuccess = true;
          break;
      }
      
      if (removalSuccess) {
        this.removalStats.totalRemoved++;
        // Notify cleanup callbacks
        this.notifyCleanupCallbacks('element_removed', { element, ruleId, strategy });
      }
      
    } catch (error) {
      console.warn('JustUI: Error during element removal:', error);
      return false;
    }

    return removalSuccess;
  }
  
  /**
   * Apply hide strategy with enhanced error handling
   * @param {HTMLElement} element - Element to hide
   */
  static applyHideStrategy(element) {
    // Create a backup of original styles for potential restoration
    const originalDisplay = element.style.display;
    const originalVisibility = element.style.visibility;
    
    element.style.display = 'none';
    element.style.visibility = 'hidden';
    
    // Store original values for potential restoration
    if (originalDisplay || originalVisibility) {
      element.setAttribute('data-justui-original-display', originalDisplay || '');
      element.setAttribute('data-justui-original-visibility', originalVisibility || '');
    }
  }
  
  /**
   * Apply removal strategy with enhanced safety checks
   * @param {HTMLElement} element - Element to remove
   */
  static applyRemovalStrategy(element) {
    // Safety check: Don't remove critical page elements
    if (this.isCriticalElement(element)) {
      console.warn('JustUI: Prevented removal of critical element:', element.tagName, element.className);
      // Fallback to neutralization
      this.neutralizeElement(element);
      return;
    }
    
    // Complete DOM removal to prevent click hijacking
    element.remove();
  }
  
  /**
   * Check if element is critical to page functionality
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is critical
   */
  static isCriticalElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const criticalTags = ['html', 'head', 'body', 'script', 'style'];
    
    if (criticalTags.includes(tagName)) {
      return true;
    }
    
    // Check for critical classes or IDs
    const classList = element.classList || [];
    const id = element.id || '';
    const criticalPatterns = ['navigation', 'header', 'footer', 'main-content', 'app-root'];
    
    return criticalPatterns.some(pattern => 
      id.toLowerCase().includes(pattern) || 
      Array.from(classList).some(cls => cls.toLowerCase().includes(pattern))
    );
  }

  /**
   * Neutralize element without removing it (disable interactions)
   * Enhanced version with comprehensive neutralization
   * @param {HTMLElement} element - Element to neutralize
   */
  static neutralizeElement(element) {
    try {
      // Store original values for potential restoration
      const originalStyles = {
        pointerEvents: element.style.pointerEvents,
        userSelect: element.style.userSelect,
        visibility: element.style.visibility,
        opacity: element.style.opacity,
        zIndex: element.style.zIndex
      };
      
      // Apply neutralization styles
      element.style.pointerEvents = 'none';
      element.style.userSelect = 'none';
      element.style.visibility = 'hidden';
      element.style.opacity = '0';
      element.style.zIndex = '-9999';
      
      // Store original styles
      element.setAttribute('data-justui-original-styles', JSON.stringify(originalStyles));
      
      // Enhanced iframe handling
      if (element.tagName === 'IFRAME') {
        const originalSrc = element.src;
        element.setAttribute('data-justui-original-src', originalSrc || '');
        element.src = 'about:blank';
        
        // Also disable iframe content loading
        element.setAttribute('sandbox', '');
      }
      
      // Remove dangerous attributes
      const dangerousAttrs = ['onclick', 'onmouseover', 'onload', 'onerror'];
      dangerousAttrs.forEach(attr => {
        if (element.hasAttribute(attr)) {
          element.removeAttribute(attr);
        }
      });
      
      // Disable form elements
      if (element.tagName === 'INPUT' || element.tagName === 'BUTTON' || element.tagName === 'SELECT') {
        element.disabled = true;
      }
      
    } catch (error) {
      console.warn('JustUI: Error during element neutralization:', error);
    }
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
   * @param {string} ruleId - ID of the rule
   * @param {string} strategy - Removal strategy
   * @returns {number} - Count of removed elements
   */
  static batchRemove(elements, ruleId, strategy = this.REMOVAL_STRATEGIES.REMOVE) {
    let count = 0;
    
    elements.forEach(element => {
      if (this.removeElement(element, ruleId, strategy)) {
        count++;
      }
    });

    return count;
  }

  /**
   * Get comprehensive statistics about processed elements
   * @returns {object} - Enhanced statistics object
   */
  static getStats() {
    const currentTime = Date.now();
    const cacheAge = currentTime - this.removalStats.lastReset;
    
    return {
      removalStats: {
        ...this.removalStats,
        cacheAge,
        cacheAgeHuman: this.formatDuration(cacheAge)
      },
      cleanupState: {
        lastCleanupCheck: this.lastCleanupCheck,
        timeSinceLastCheck: currentTime - this.lastCleanupCheck,
        registeredCallbacks: this.cleanupCallbacks.size,
        maxCacheAge: this.maxCacheAge
      },
      performance: {
        averageRemovalsPerMinute: cacheAge > 0 ? 
          (this.removalStats.totalRemoved / (cacheAge / 60000)).toFixed(2) : 0,
        mostUsedStrategy: this.getMostUsedStrategy()
      },
      note: 'WeakSet-based tracking prevents memory leaks but doesn\'t support size counting',
      usage: 'Use isProcessed(element) to check individual elements'
    };
  }
  
  /**
   * Get the most frequently used removal strategy
   * @returns {string} Most used strategy
   */
  static getMostUsedStrategy() {
    const counts = this.removalStats.strategyCounts;
    return Object.keys(counts).reduce((max, strategy) => 
      counts[strategy] > counts[max] ? strategy : max, 'remove');
  }
  
  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms/60000).toFixed(1)}m`;
    return `${(ms/3600000).toFixed(1)}h`;
  }

  /**
   * Register cleanup callback for notifications
   * @param {function} callback - Callback function
   */
  static onCleanup(callback) {
    if (typeof callback === 'function') {
      this.cleanupCallbacks.add(callback);
    }
  }
  
  /**
   * Unregister cleanup callback
   * @param {function} callback - Callback to remove
   */
  static offCleanup(callback) {
    this.cleanupCallbacks.delete(callback);
  }
  
  /**
   * Notify cleanup callbacks
   * @param {string} event - Event type
   * @param {object} data - Event data
   */
  static notifyCleanupCallbacks(event, data) {
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.warn('JustUI: Error in cleanup callback:', error);
      }
    });
  }
  
  /**
   * Perform periodic cleanup checks
   */
  static performPeriodicCleanupCheck() {
    const currentTime = Date.now();
    const timeSinceLastCheck = currentTime - this.lastCleanupCheck;
    
    // Check every 30 seconds
    if (timeSinceLastCheck > 30000) {
      this.lastCleanupCheck = currentTime;
      
      const cacheAge = currentTime - this.removalStats.lastReset;
      if (cacheAge > this.maxCacheAge) {
        console.log('JustUI: Auto-resetting ElementRemover stats due to age');
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
      lastReset: Date.now(),
      strategyCounts: {
        hide: 0,
        remove: 0,
        neutralize: 0
      }
    };
    
    this.notifyCleanupCallbacks('stats_reset', { timestamp: Date.now() });
  }
  
  /**
   * Enhanced cleanup method for comprehensive memory management
   * WeakSet automatically cleans up when elements are garbage collected
   */
  static cleanup() {
    console.log('JustUI: Starting ElementRemover cleanup...');
    
    const preCleanupStats = { ...this.removalStats };
    
    // Create new WeakSet to release any references
    this.processedElements = new WeakSet();
    
    // Reset all statistics
    this.resetStats();
    
    // Clear cleanup callbacks
    const callbackCount = this.cleanupCallbacks.size;
    this.cleanupCallbacks.clear();
    
    // Update cleanup timing
    this.lastCleanupCheck = Date.now();
    
    console.log('JustUI: ElementRemover cleanup completed:', {
      beforeCleanup: preCleanupStats,
      removedCallbacks: callbackCount,
      newWeakSetCreated: true,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      stats: preCleanupStats,
      callbacksRemoved: callbackCount
    };
  }
  
  /**
   * Restore a neutralized element (if possible)
   * @param {HTMLElement} element - Element to restore
   * @returns {boolean} True if restoration was attempted
   */
  static restoreElement(element) {
    if (!element) return false;
    
    try {
      // Restore original styles if stored
      const originalStyles = element.getAttribute('data-justui-original-styles');
      if (originalStyles) {
        const styles = JSON.parse(originalStyles);
        Object.assign(element.style, styles);
        element.removeAttribute('data-justui-original-styles');
      }
      
      // Restore iframe src if stored
      if (element.tagName === 'IFRAME') {
        const originalSrc = element.getAttribute('data-justui-original-src');
        if (originalSrc !== null) {
          element.src = originalSrc;
          element.removeAttribute('data-justui-original-src');
          element.removeAttribute('sandbox');
        }
      }
      
      // Re-enable form elements
      if (element.tagName === 'INPUT' || element.tagName === 'BUTTON' || element.tagName === 'SELECT') {
        element.disabled = false;
      }
      
      // Clean up JustUI attributes
      const justUIAttrs = ['data-justui-removed', 'data-justui-timestamp', 'data-justui-strategy'];
      justUIAttrs.forEach(attr => element.removeAttribute(attr));
      
      console.log('JustUI: Element restoration attempted for:', element.tagName);
      return true;
      
    } catch (error) {
      console.warn('JustUI: Error during element restoration:', error);
      return false;
    }
  }
}