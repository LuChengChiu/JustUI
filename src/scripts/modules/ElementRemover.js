/**
 * Element Removal Module - Handles DOM element removal strategies
 * Follows Single Responsibility Principle
 * Uses WeakSet for automatic memory management of processed elements
 */
export class ElementRemover {
  static REMOVAL_STRATEGIES = {
    HIDE: 'hide',
    REMOVE: 'remove',
    NEUTRALIZE: 'neutralize'
  };

  // WeakSet for automatic garbage collection of processed elements
  static processedElements = new WeakSet();

  /**
   * Remove element completely from DOM
   * @param {HTMLElement} element - Element to remove
   * @param {string} ruleId - ID of the rule that triggered removal
   * @param {string} strategy - Removal strategy to use
   */
  static removeElement(element, ruleId, strategy = this.REMOVAL_STRATEGIES.REMOVE) {
    if (!element || this.processedElements.has(element)) {
      return false;
    }

    // Mark element as processed using WeakSet for automatic memory management
    this.processedElements.add(element);
    
    // Keep debugging attributes for development (these will be GC'd with element)
    element.setAttribute('data-justui-removed', ruleId);
    element.setAttribute('data-justui-timestamp', Date.now());

    switch (strategy) {
      case this.REMOVAL_STRATEGIES.HIDE:
        element.style.display = 'none';
        element.style.visibility = 'hidden';
        break;

      case this.REMOVAL_STRATEGIES.NEUTRALIZE:
        this.neutralizeElement(element);
        break;

      case this.REMOVAL_STRATEGIES.REMOVE:
      default:
        // Complete DOM removal to prevent click hijacking
        element.remove();
        break;
    }

    return true;
  }

  /**
   * Neutralize element without removing it (disable interactions)
   * @param {HTMLElement} element - Element to neutralize
   */
  static neutralizeElement(element) {
    element.style.pointerEvents = 'none';
    element.style.userSelect = 'none';
    element.style.visibility = 'hidden';
    element.style.opacity = '0';
    element.style.zIndex = '-1';
    
    // Remove event listeners if it's an iframe
    if (element.tagName === 'IFRAME') {
      element.src = 'about:blank';
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
   * Get statistics about processed elements
   * Note: WeakSet doesn't allow enumeration, so we can't return count
   * @returns {object} - Statistics object
   */
  static getStats() {
    return {
      note: 'WeakSet-based tracking prevents memory leaks but doesn\'t support size counting',
      hasProcessedElements: 'Use isProcessed(element) to check individual elements'
    };
  }

  /**
   * Cleanup method for memory management
   * WeakSet automatically cleans up when elements are garbage collected
   */
  static cleanup() {
    // Create new WeakSet to release any references
    this.processedElements = new WeakSet();
    console.log('JustUI: ElementRemover processed elements WeakSet reset');
  }
}