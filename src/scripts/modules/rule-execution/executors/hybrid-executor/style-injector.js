/**
 * Style Injector
 *
 * @fileoverview Injects CSS rules into the document for instant element hiding.
 * Uses the browser's native CSS engine (C++) for maximum performance.
 *
 * This is the "Declarative Fast Path" of the Hybrid Engine.
 * All 13,000+ EasyList selectors are injected as a single <style> tag,
 * letting the browser handle matching and hiding instantly.
 *
 * @module style-injector
 */

import Logger from "@script-utils/logger.js";

/**
 * Injects CSS hiding rules into the document
 */
export class StyleInjector {
  constructor() {
    /**
     * Reference to injected style element
     * @type {HTMLStyleElement|null}
     */
    this.styleElement = null;

    /**
     * Unique ID for the style element
     * @type {string}
     */
    this.styleId = 'easylist-hide-rules';
  }

  /**
   * Inject all selectors as CSS hiding rules
   * @param {string[]} selectors - Array of CSS selectors to hide
   * @returns {number} Number of selectors injected
   */
  inject(selectors) {
    if (!selectors || selectors.length === 0) {
      Logger.warn("RuleExecution:StyleInjector", "No selectors to inject");
      return 0;
    }

    // Remove existing style element if present
    this.cleanup();

    // Build CSS string with all selectors
    const css = this.buildCss(selectors);

    // Create and inject style element
    this.styleElement = document.createElement('style');
    this.styleElement.id = this.styleId;
    this.styleElement.setAttribute('data-easylist', 'true');
    this.styleElement.textContent = css;

    // Inject into document head (or documentElement if head not available)
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(this.styleElement);
      Logger.info(
        "RuleExecution:StyleInjector",
        `Injected ${selectors.length} CSS rules`
      );
    } else {
      Logger.error(
        "RuleExecution:StyleInjector",
        "No valid target for style injection"
      );
      return 0;
    }

    return selectors.length;
  }

  /**
   * Build CSS string from selectors
   * @private
   * @param {string[]} selectors - Array of CSS selectors
   * @returns {string} CSS string
   */
  buildCss(selectors) {
    // Create hiding rule for each selector
    const hideRules = selectors
      .map(sel => `${sel} { display: none !important; }`)
      .join('\n');

    // Add the data-attribute hiding rule for JS-marked elements
    const dataAttrRule = `
[data-content-blocked="true"] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  width: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}`;

    return `/* EasyList DOM Hiding Rules - Auto-generated */\n${hideRules}\n${dataAttrRule}`;
  }

  /**
   * Remove injected style element
   */
  cleanup() {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    // Also try to remove by ID in case reference was lost
    const existing = document.getElementById(this.styleId);
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Check if styles are currently injected
   * @returns {boolean}
   */
  isInjected() {
    return this.styleElement !== null && document.contains(this.styleElement);
  }

  /**
   * Get number of rules currently injected
   * @returns {number}
   */
  getInjectedCount() {
    if (!this.styleElement) {
      return 0;
    }

    // Count rules in stylesheet
    const text = this.styleElement.textContent || '';
    const matches = text.match(/\{[^}]+\}/g);
    return matches ? matches.length - 1 : 0; // -1 for data-attr rule
  }
}
