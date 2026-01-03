/**
 * Selector Parser
 *
 * @fileoverview Pass-through parser for CSS selector rules.
 * Default and custom rules are already in CSS selector format, so no parsing needed.
 *
 * @module selector-parser
 */

import Logger from "@script-utils/logger.js";

/**
 * Parser for CSS selector-based rules (no-op)
 */
export class SelectorParser {
  /**
   * Parse CSS selector rules (pass-through)
   * @param {Rule[]} rules - Array of rule objects with CSS selectors
   * @returns {Promise<Rule[]>} Filtered array of enabled rules
   */
  async parse(rules) {
    if (!Array.isArray(rules)) {
      Logger.warn("RuleExecution:SelectorParser", "rules is not an array", rules);
      return [];
    }

    // Filter to only enabled rules with valid selectors
    return rules.filter(rule => {
      if (rule.enabled === false) {
        return false;
      }

      if (!rule.selector || typeof rule.selector !== 'string') {
        Logger.warn("RuleExecution:SelectorParser", "Invalid rule selector", rule);
        return false;
      }

      if (rule.selector.trim().length === 0) {
        Logger.warn("RuleExecution:SelectorParser", "Empty rule selector", rule);
        return false;
      }

      return true;
    });
  }

  /**
   * Validate a single CSS selector
   * @param {string} selector - CSS selector to validate
   * @returns {boolean} True if selector is valid
   */
  validateSelector(selector) {
    if (!selector || typeof selector !== 'string') {
      return false;
    }

    try {
      // Test if selector is valid by attempting to query with it
      document.querySelectorAll(selector);
      return true;
    } catch (error) {
      Logger.warn(
        "RuleExecution:SelectorParser",
        "Invalid CSS selector",
        { selector, message: error.message }
      );
      return false;
    }
  }
}
