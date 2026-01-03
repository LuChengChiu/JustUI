/**
 * Token Indexer
 *
 * @fileoverview Builds an inverted index from CSS selectors to tokens.
 * This enables O(1) lookup to check if an element's class/id matches any rule.
 *
 * Instead of checking each element against 13,000 selectors:
 * 1. Extract tokens (classes, IDs, tag names) from selectors
 * 2. Build Map: token → [selector1, selector2, ...]
 * 3. For each DOM element, check if its tokens exist in the Map
 *
 * This reduces complexity from O(selectors × elements) to O(elements × tokens)
 *
 * @module token-indexer
 */

import Logger from "@script-utils/logger.js";

/**
 * Builds and manages inverted token index for fast selector lookup
 */
export class TokenIndexer {
  constructor() {
    /**
     * Inverted index: token → selectors containing that token
     * @type {Map<string, string[]>}
     */
    this.index = new Map();

    /**
     * Set of all indexed selectors
     * @type {Set<string>}
     */
    this.selectorSet = new Set();
  }

  /**
   * Build inverted index from selectors
   * @param {string[]} selectors - Array of CSS selectors
   * @returns {TokenIndexer} Returns this for chaining
   */
  build(selectors) {
    // Clear existing index
    this.index.clear();
    this.selectorSet.clear();

    for (const selector of selectors) {
      if (!selector || typeof selector !== "string") {
        continue;
      }

      // Track all selectors
      this.selectorSet.add(selector);

      // Extract tokens from selector
      const tokens = this.extractTokens(selector);

      // Add each token to index
      for (const token of tokens) {
        if (!this.index.has(token)) {
          this.index.set(token, []);
        }
        this.index.get(token).push(selector);
      }
    }

    Logger.debug(
      "RuleExecution:TokenIndexer",
      `Built index with ${this.index.size} unique tokens from ${selectors.length} selectors`
    );

    return this;
  }

  /**
   * Extract searchable tokens from a CSS selector
   * @param {string} selector - CSS selector
   * @returns {string[]} Array of tokens
   */
  extractTokens(selector) {
    const tokens = [];

    // Extract class names: .ad-banner → "ad-banner"
    // Match class selectors including those with hyphens, underscores, numbers
    const classMatches = selector.match(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g);
    if (classMatches) {
      for (const match of classMatches) {
        tokens.push(match.substring(1)); // Remove leading dot
      }
    }

    // Extract IDs: #AD_Top → "AD_Top"
    const idMatches = selector.match(/#([a-zA-Z_][a-zA-Z0-9_-]*)/g);
    if (idMatches) {
      for (const match of idMatches) {
        tokens.push(match.substring(1)); // Remove leading hash
      }
    }

    // // Extract tag names at start of selector: div.ad → "div"
    const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (tagMatch) {
      tokens.push(tagMatch[1].toLowerCase());
    }

    // Extract attribute selector values: [class^="adDisplay"] → "adDisplay"
    // Also handles [class*="ad"], [id="banner"], etc.
    const attrMatches = selector.match(
      /\[(?:class|id|data-[a-z-]+)[\^*$~|]?="([^"]+)"\]/gi
    );
    if (attrMatches) {
      for (const match of attrMatches) {
        const valueMatch = match.match(/="([^"]+)"/);
        if (valueMatch) {
          tokens.push(valueMatch[1]);
        }
      }
    }

    return tokens;
  }

  /**
   * Check if a token exists in the index
   * @param {string} token - Token to check
   * @returns {boolean}
   */
  has(token) {
    return this.index.has(token);
  }

  /**
   * Get selectors associated with a token
   * @param {string} token - Token to lookup
   * @returns {string[]} Array of selectors (empty if not found)
   */
  get(token) {
    return this.index.get(token) || [];
  }

  /**
   * Check if selector is in the index
   * @param {string} selector - Selector to check
   * @returns {boolean}
   */
  hasSelector(selector) {
    return this.selectorSet.has(selector);
  }

  /**
   * Get total number of unique tokens in index
   * @returns {number}
   */
  getTokenCount() {
    return this.index.size;
  }

  /**
   * Get total number of selectors indexed
   * @returns {number}
   */
  getSelectorCount() {
    return this.selectorSet.size;
  }

  /**
   * Clear the index
   */
  clear() {
    this.index.clear();
    this.selectorSet.clear();
  }

  /**
   * Get statistics about the index
   * @returns {{tokenCount: number, selectorCount: number, avgSelectorsPerToken: number}}
   */
  getStats() {
    let totalSelectors = 0;
    for (const selectors of this.index.values()) {
      totalSelectors += selectors.length;
    }

    return {
      tokenCount: this.index.size,
      selectorCount: this.selectorSet.size,
      avgSelectorsPerToken:
        this.index.size > 0 ? totalSelectors / this.index.size : 0,
    };
  }
}
