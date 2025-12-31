/**
 * DOM Scanner
 *
 * @fileoverview Single-pass DOM scanner with tiered removal strategy.
 * Scans all elements with id/class attributes and checks against token index.
 *
 * Tiered Removal Strategy:
 * - Tier 1: REMOVE third-party iframes (safe, saves bandwidth)
 * - Tier 2: REMOVE scripts and link tags (prevents ad execution)
 * - Tier 3: HIDE everything else (framework-safe)
 *
 * @module dom-scanner
 */

import { isSpecialUrlExact } from "@script-utils/threat-patterns.js";

/**
 * DOM Scanner with tiered removal strategy
 */
export class DomScanner {
  /**
   * @param {TokenIndexer} tokenIndex - Token indexer instance
   * @param {Object} options - Scanner options
   */
  constructor(tokenIndex, options = {}) {
    /**
     * Token indexer for O(1) lookups
     * @type {TokenIndexer}
     */
    this.tokenIndex = tokenIndex;

    /**
     * Scanner options
     * @type {Object}
     */
    this.options = {
      enableRemoval: true,   // Enable actual removal (vs just counting)
      logMatches: false,     // Log matched elements for debugging
      ...options
    };

    /**
     * Statistics for current scan
     * @type {{removed: number, hidden: number}}
     */
    this.stats = { removed: 0, hidden: 0 };
  }

  /**
   * Scan entire DOM for matching elements
   * @returns {{removed: number, hidden: number}} Scan statistics
   */
  scan() {
    this.stats = { removed: 0, hidden: 0 };

    // Query all elements with id or class (most EasyList rules target these)
    const elements = document.querySelectorAll('[id],[class]');

    for (const el of elements) {
      this.processElement(el);
    }

    console.log(`DomScanner: Scan complete - removed: ${this.stats.removed}, hidden: ${this.stats.hidden}`);

    return { ...this.stats };
  }

  /**
   * Scan a single element and its descendants
   * @param {Element} root - Root element to scan
   * @returns {{removed: number, hidden: number}} Scan statistics
   */
  scanElement(root) {
    const localStats = { removed: 0, hidden: 0 };

    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      return localStats;
    }

    // Process root element
    const rootResult = this.processElement(root);
    localStats.removed += rootResult.removed;
    localStats.hidden += rootResult.hidden;

    // If root was removed, don't process children
    if (rootResult.removed > 0) {
      return localStats;
    }

    // Process descendants with id/class
    const descendants = root.querySelectorAll('[id],[class]');
    for (const el of descendants) {
      const result = this.processElement(el);
      localStats.removed += result.removed;
      localStats.hidden += result.hidden;
    }

    return localStats;
  }

  /**
   * Process a single element
   * @private
   * @param {Element} el - Element to process
   * @returns {{removed: number, hidden: number}}
   */
  processElement(el) {
    const result = { removed: 0, hidden: 0 };

    // Skip already processed elements
    if (el.hasAttribute('data-content-blocked')) {
      return result;
    }

    // Extract tokens from element
    const tokens = this.extractElementTokens(el);

    // Check if any token matches
    for (const token of tokens) {
      if (this.tokenIndex.has(token)) {
        // Token match found - now validate with actual CSS selectors
        const possibleSelectors = this.tokenIndex.get(token);
        let actualMatch = false;

        // Validate against each selector that contains this token
        for (const selector of possibleSelectors) {
          try {
            if (el.matches(selector)) {
              actualMatch = true;

              if (this.options.logMatches) {
                console.log('DomScanner: Selector match found', {
                  selector,
                  element: el.tagName,
                  id: el.id,
                  class: el.className
                });
              }

              break; // Found actual match, stop checking selectors
            }
          } catch (e) {
            // Invalid selector - skip it
            console.warn('DomScanner: Invalid selector:', selector, e.message);
          }
        }

        // Only block if actual selector matched (not just token)
        if (actualMatch && this.options.enableRemoval) {
          if (this.shouldRemove(el)) {
            el.remove();
            result.removed = 1;
            this.stats.removed++;
          } else {
            el.setAttribute('data-content-blocked', 'true');
            result.hidden = 1;
            this.stats.hidden++;
          }

          break; // Element processed, stop checking tokens
        }
      }
    }

    return result;
  }

  /**
   * Extract tokens from an element (class names, id, tag name)
   * @private
   * @param {Element} el - Element to extract tokens from
   * @returns {string[]} Array of tokens
   */
  extractElementTokens(el) {
    const tokens = [];

    // Add class names
    if (el.classList && el.classList.length > 0) {
      tokens.push(...el.classList);
    }

    // Add ID
    if (el.id) {
      tokens.push(el.id);
    }

    // Add tag name (lowercase)
    if (el.tagName) {
      tokens.push(el.tagName.toLowerCase());
    }

    return tokens.filter(Boolean);
  }

  // ========== TIERED REMOVAL STRATEGY ==========

  /**
   * Determine if element should be removed (vs hidden)
   * @private
   * @param {Element} el - Element to check
   * @returns {boolean} True if safe to remove
   */
  shouldRemove(el) {
    const tagName = el.tagName.toLowerCase();

    // Tier 1: Always safe to remove (no layout/framework impact)
    if (tagName === 'script' || tagName === 'link') {
      return true;
    }

    // Tier 2: Remove third-party iframes (ad iframes)
    if (tagName === 'iframe') {
      return this.isThirdPartyIframe(el) && !this.isManagedByFramework(el);
    }

    // Tier 3: Hide everything else (divs, spans, etc.)
    return false;
  }

  /**
   * Check if iframe is third-party (cross-origin)
   * @private
   * @param {HTMLIFrameElement} iframe - Iframe element
   * @returns {boolean} True if third-party
   */
  isThirdPartyIframe(iframe) {
    const src = iframe.src || iframe.getAttribute('src');

    // Skip special cases - hide instead of remove
    if (!src ||
        src === '' ||
        isSpecialUrlExact(src) ||
        src.startsWith('data:') ||
        src.startsWith('blob:') ||
        src.startsWith('javascript:')) {
      return false;
    }

    try {
      const iframeOrigin = new URL(src, window.location.href).hostname;
      const pageOrigin = window.location.hostname;

      // Cross-origin = third-party = probably ad
      return iframeOrigin !== pageOrigin;
    } catch (error) {
      // Invalid URL, hide instead of remove
      return false;
    }
  }

  /**
   * Check if element is managed by React/Vue framework
   * @private
   * @param {Element} el - Element to check
   * @returns {boolean} True if framework-managed
   */
  isManagedByFramework(el) {
    // React internal markers
    if (el._reactRootContainer) {
      return true;
    }

    // Check for React fiber keys
    const keys = Object.keys(el);
    if (keys.some(key => key.startsWith('__react'))) {
      return true;
    }

    // Vue internal markers
    if (el.__vue__ || el.__vueParentComponent) {
      return true;
    }

    // Angular markers
    if (keys.some(key => key.startsWith('__ng'))) {
      return true;
    }

    return false;
  }

  /**
   * Get current scan statistics
   * @returns {{removed: number, hidden: number}}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { removed: 0, hidden: 0 };
  }
}
