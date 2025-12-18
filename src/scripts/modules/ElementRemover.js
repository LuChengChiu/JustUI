/**
 * Element Removal Module - Handles DOM element removal strategies
 * Follows Single Responsibility Principle
 */
export class ElementRemover {
  static REMOVAL_STRATEGIES = {
    HIDE: 'hide',
    REMOVE: 'remove',
    NEUTRALIZE: 'neutralize'
  };

  /**
   * Remove element completely from DOM
   * @param {HTMLElement} element - Element to remove
   * @param {string} ruleId - ID of the rule that triggered removal
   * @param {string} strategy - Removal strategy to use
   */
  static removeElement(element, ruleId, strategy = this.REMOVAL_STRATEGIES.REMOVE) {
    if (!element || element.hasAttribute('data-justui-removed')) {
      return false;
    }

    // Mark element before removal for debugging
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
    return element.hasAttribute('data-justui-removed');
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
}