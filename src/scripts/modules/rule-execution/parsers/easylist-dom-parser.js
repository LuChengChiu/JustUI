/**
 * EasyList DOM Parser
 *
 * @fileoverview Parses EasyList cosmetic filter rules (##selector format).
 * Converts raw EasyList lines into structured rule objects for the hybrid executor.
 *
 * EasyList format:
 * - `##.selector` - Hide elements matching .selector on ALL domains
 * - `###id` - Hide element with id on ALL domains
 * - `##[attr="value"]` - Attribute selectors
 *
 * Note: easylist_general_hide.txt contains ONLY global rules (no domain prefixes)
 *
 * @module easylist-dom-parser
 */

import Logger from "@script-utils/logger.js";

/**
 * Parser for EasyList cosmetic filter rules
 */
export class EasyListDomParser {
  /**
   * Parse raw EasyList lines into structured rule objects
   * @param {string[]} rawLines - Array of raw EasyList lines from source
   * @returns {Promise<Rule[]>} Array of parsed rule objects
   */
  async parse(rawLines) {
    if (!Array.isArray(rawLines)) {
      Logger.warn(
        "RuleExecution:EasyListDomParser",
        "rawLines is not an array",
        rawLines
      );
      return [];
    }

    const rules = [];
    let index = 0;

    for (const line of rawLines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) {
        continue;
      }

      // Skip comments (start with !)
      if (trimmed.startsWith('!')) {
        continue;
      }

      // Skip section headers (start with [)
      if (trimmed.startsWith('[')) {
        continue;
      }

      // Only process cosmetic filter rules (## prefix)
      if (!trimmed.startsWith('##')) {
        continue;
      }

      // Extract selector (everything after ##)
      const selector = trimmed.substring(2);

      // Skip empty selectors
      if (selector.length === 0) {
        continue;
      }

      // Skip procedural/extended selectors (not standard CSS)
      // These contain :has(), :contains(), :xpath(), etc.
      if (this.isProceduralSelector(selector)) {
        continue;
      }

      rules.push({
        id: `easylist-${index}`,
        selector: selector,
        domains: ['*'], // All rules in general_hide.txt apply globally
        enabled: true,
        category: 'easylist',
        confidence: 'high',
        source: 'easylist_general_hide'
      });

      index++;
    }

    Logger.debug(
      "RuleExecution:EasyListDomParser",
      `Parsed ${rules.length} valid rules from ${rawLines.length} lines`
    );

    return rules;
  }

  /**
   * Check if selector is a procedural/extended selector (not standard CSS)
   * @private
   * @param {string} selector - CSS selector to check
   * @returns {boolean} True if procedural (should be skipped)
   */
  isProceduralSelector(selector) {
    // Procedural selectors use special pseudo-classes not supported by CSS
    const proceduralPatterns = [
      ':has-text(',       // ABP extended
      ':contains(',       // ABP extended
      ':xpath(',          // ABP extended
      ':matches-css(',    // ABP extended
      ':min-text-length(', // ABP extended
      ':watch-attr(',     // ABP extended
      ':-abp-',           // ABP extended prefix
      ':upward(',         // uBO extended
      ':remove(',         // uBO extended
      ':style(',          // uBO extended
      ':matches-path(',   // uBO extended
      ':matches-media(',  // uBO extended
    ];

    const lowerSelector = selector.toLowerCase();
    return proceduralPatterns.some(pattern => lowerSelector.includes(pattern));
  }

  /**
   * Get statistics about parsed rules
   * @param {Rule[]} rules - Parsed rules
   * @returns {{total: number, byType: Object}}
   */
  getStatistics(rules) {
    const stats = {
      total: rules.length,
      byType: {
        class: 0,
        id: 0,
        attribute: 0,
        tag: 0,
        complex: 0
      }
    };

    for (const rule of rules) {
      const sel = rule.selector;

      if (sel.startsWith('.')) {
        stats.byType.class++;
      } else if (sel.startsWith('#')) {
        stats.byType.id++;
      } else if (sel.startsWith('[')) {
        stats.byType.attribute++;
      } else if (/^[a-zA-Z]+/.test(sel)) {
        stats.byType.tag++;
      } else {
        stats.byType.complex++;
      }
    }

    return stats;
  }
}
