/**
 * Element Classifier Module
 * Classifies DOM elements as 'critical' (requiring real-time analysis) or 'bulk' (suitable for snapshot processing)
 * Follows Single Responsibility Principle and implements ICleanable interface
 */

import { HIGH_Z_INDEX_THRESHOLD } from '../constants.js';

export class ElementClassifier {
  constructor() {
    this.criticalSelectors = [
      'iframe',
      '[style*="position: fixed"]',
      '[style*="position:fixed"]',
      '[style*="z-index"]',
      '[style*="transform"]',
      '[style*="animation"]'
    ];
    
    // Cache for performance optimization
    this.classificationCache = new WeakMap();
    this.stats = {
      totalClassified: 0,
      criticalCount: 0,
      bulkCount: 0,
      cacheHits: 0
    };
  }

  /**
   * Classify a single element as critical or bulk
   * @param {HTMLElement} element - Element to classify
   * @returns {string} 'critical' | 'bulk'
   */
  classifyElement(element) {
    // Check cache first for performance
    if (this.classificationCache.has(element)) {
      this.stats.cacheHits++;
      return this.classificationCache.get(element);
    }

    const classification = this._determineClassification(element);
    
    // Cache the result
    this.classificationCache.set(element, classification);
    this.stats.totalClassified++;
    
    if (classification === 'critical') {
      this.stats.criticalCount++;
    } else {
      this.stats.bulkCount++;
    }

    return classification;
  }

  /**
   * Classify a batch of elements efficiently
   * @param {HTMLElement[]|NodeList} elements - Elements to classify
   * @returns {object} { criticalElements: HTMLElement[], bulkElements: HTMLElement[] }
   */
  classifyBatch(elements) {
    const criticalElements = [];
    const bulkElements = [];

    for (const element of elements) {
      if (this.classifyElement(element) === 'critical') {
        criticalElements.push(element);
      } else {
        bulkElements.push(element);
      }
    }

    return { criticalElements, bulkElements };
  }

  /**
   * Get CSS selectors that can immediately identify critical elements
   * @returns {string[]} Array of CSS selectors
   */
  getCriticalSelectors() {
    return [...this.criticalSelectors];
  }

  /**
   * Pre-classify elements using CSS selectors for bulk optimization
   * @param {Document|Element} context - Context to search within
   * @returns {object} { criticalElements: HTMLElement[], potentialBulkElements: HTMLElement[] }
   */
  preClassifyWithSelectors(context = document) {
    const criticalElements = [];
    const processedElements = new Set();

    // First, find all obviously critical elements using selectors
    for (const selector of this.criticalSelectors) {
      try {
        const elements = context.querySelectorAll(selector);
        for (const element of elements) {
          if (!processedElements.has(element)) {
            criticalElements.push(element);
            processedElements.add(element);
          }
        }
      } catch (error) {
        console.warn(`JustUI: Invalid selector "${selector}":`, error);
      }
    }

    // Then find potential bulk elements (excluding already classified critical ones)
    const allSuspicious = context.querySelectorAll('div, section, aside, nav, header');
    const potentialBulkElements = Array.from(allSuspicious).filter(
      element => !processedElements.has(element)
    );

    return { criticalElements, potentialBulkElements };
  }

  /**
   * Determine element classification based on properties
   * @param {HTMLElement} element - Element to analyze
   * @returns {string} 'critical' | 'bulk'
   * @private
   */
  _determineClassification(element) {
    try {
      // 1. Tag-based classification
      if (element.tagName === 'IFRAME') {
        return 'critical';
      }

      // 2. Inline style checks (fast, no computed style needed)
      const inlineStyle = element.style;
      
      if (inlineStyle.position === 'fixed') {
        return 'critical';
      }

      if (inlineStyle.transform && inlineStyle.transform !== 'none') {
        return 'critical';
      }

      if (inlineStyle.animation && inlineStyle.animation !== 'none') {
        return 'critical';
      }

      // 3. Z-index checks (inline style first, then attribute)
      const inlineZIndex = inlineStyle.zIndex;
      if (inlineZIndex && parseInt(inlineZIndex) > HIGH_Z_INDEX_THRESHOLD) {
        return 'critical';
      }

      // Check z-index in style attribute string (covers CSS property in style="")
      const styleAttr = element.getAttribute('style') || '';
      if (styleAttr.includes('z-index') && this._hasHighZIndex(styleAttr)) {
        return 'critical';
      }

      // 4. Class-based heuristics for known critical patterns
      const className = element.className || '';
      if (this._hasKnownCriticalClasses(className)) {
        return 'critical';
      }

      // 5. Attribute-based detection for overlays and popups
      if (this._hasOverlayAttributes(element)) {
        return 'critical';
      }

      // Default to bulk processing for standard content elements
      return 'bulk';
    } catch (error) {
      // If classification fails, err on the side of caution
      console.warn('JustUI: Error classifying element, defaulting to critical:', error);
      return 'critical';
    }
  }

  /**
   * Check if style string contains high z-index value
   * @param {string} styleString - CSS style string
   * @returns {boolean}
   * @private
   */
  _hasHighZIndex(styleString) {
    const zIndexMatch = styleString.match(/z-index\s*:\s*(\d+)/);
    return zIndexMatch && parseInt(zIndexMatch[1]) > HIGH_Z_INDEX_THRESHOLD;
  }

  /**
   * Check for known critical CSS classes
   * @param {string} className - Element class names
   * @returns {boolean}
   * @private
   */
  _hasKnownCriticalClasses(className) {
    const criticalClassPatterns = [
      'modal', 'popup', 'overlay', 'lightbox', 'tooltip',
      'dropdown', 'menu', 'fixed', 'sticky', 'floating'
    ];
    
    const lowerClassName = className.toLowerCase();
    return criticalClassPatterns.some(pattern => lowerClassName.includes(pattern));
  }

  /**
   * Check for attributes that indicate overlay/popup behavior
   * @param {HTMLElement} element - Element to check
   * @returns {boolean}
   * @private
   */
  _hasOverlayAttributes(element) {
    // Check for data attributes commonly used in overlays
    const overlayAttributes = [
      'data-modal', 'data-popup', 'data-overlay', 'data-lightbox',
      'data-tooltip', 'data-dropdown'
    ];
    
    return overlayAttributes.some(attr => element.hasAttribute(attr));
  }

  /**
   * Get classification statistics
   * @returns {object} Classification performance stats
   */
  getStats() {
    return {
      ...this.stats,
      cacheEfficiency: this.stats.totalClassified > 0 
        ? (this.stats.cacheHits / this.stats.totalClassified * 100).toFixed(1) + '%'
        : '0%',
      criticalRatio: this.stats.totalClassified > 0
        ? (this.stats.criticalCount / this.stats.totalClassified * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStats() {
    this.stats = {
      totalClassified: 0,
      criticalCount: 0,
      bulkCount: 0,
      cacheHits: 0
    };
  }

  /**
   * Clear classification cache to free memory
   */
  clearCache() {
    this.classificationCache = new WeakMap();
  }

  /**
   * Cleanup method implementation for ICleanable interface
   * Called when the module is being destroyed
   */
  cleanup() {
    this.clearCache();
    this.resetStats();
    this.criticalSelectors = [];
    
    console.log('JustUI: ElementClassifier cleaned up');
  }
}