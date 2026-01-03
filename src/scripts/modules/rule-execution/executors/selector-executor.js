/**
 * Selector Executor
 *
 * @fileoverview Executes CSS selector-based DOM element removal rules.
 * Handles domain matching, element querying, and removal via ElementRemover.
 *
 * @module selector-executor
 */

import Logger from "@script-utils/logger.js";
import { domainMatches } from "@utils/url-utils.js";
import { ElementRemover } from "@modules/element-remover.js";
/**
 * Executor for CSS selector-based rules
 */
export class SelectorExecutor {
  /**
   * @param {PerformanceCoordinator} performanceCoordinator - Time-slicing coordinator
   */
  constructor(performanceCoordinator) {
    this.performanceCoordinator = performanceCoordinator;
    this.processedElements = new WeakSet();
  }

  /**
   * Execute CSS selector rules
   * @param {Rule[]} rules - Parsed rules from source
   * @param {string} currentDomain - Current page domain
   * @param {object} options - Execution options
   * @param {boolean} [options.timeSlicing=true] - Enable time-slicing
   * @param {number} [options.maxExecutionTime=16] - Max time per frame (ms)
   * @returns {Promise<number>} Number of elements removed
   */
  async execute(rules, currentDomain, options = {}) {
    const { timeSlicing = true, maxExecutionTime = 16 } = options;
    const startTime = performance.now();

    // Filter rules applicable to current domain
    const applicableRules = rules.filter((rule) =>
      this.ruleAppliesTo(rule, currentDomain)
    );

    if (applicableRules.length === 0) {
      return 0;
    }

    let removedCount = 0;

    for (const rule of applicableRules) {
      try {
        // Query DOM elements matching the selector
        const elements = document.querySelectorAll(rule.selector);

        if (elements.length === 0) {
          continue;
        }

        // Remove matched elements via ElementRemover
        const removed = ElementRemover.batchRemove(
          Array.from(elements),
          rule.id || `rule-${Date.now()}`,
          ElementRemover.REMOVAL_STRATEGIES.REMOVE
        );

        removedCount += removed;

        if (removed > 0) {
          Logger.debug(
            "RuleExecution:SelectorExecutor",
            `"${rule.description || rule.selector}" removed ${removed} elements`
          );
        }

        // Yield to main thread if time-slicing enabled
        if (timeSlicing && this.performanceCoordinator) {
          await this.performanceCoordinator.yieldIfNeeded(
            startTime,
            maxExecutionTime
          );
        }
      } catch (error) {
        Logger.error(
          "RuleExecution:SelectorExecutor",
          `Error executing rule ${rule.id}`,
          error
        );
        // Continue with next rule instead of failing completely
      }
    }

    return removedCount;
  }

  /**
   * Check if rule applies to current domain
   * @param {Rule} rule - Rule with domains array
   * @param {string} domain - Current domain
   * @returns {boolean} True if rule applies
   */
  ruleAppliesTo(rule, domain) {
    if (
      !rule.domains ||
      !Array.isArray(rule.domains) ||
      rule.domains.length === 0
    ) {
      return false;
    }

    // Wildcard matches all domains
    if (rule.domains.includes("*")) {
      return true;
    }

    // Check if any rule domain matches current domain
    return rule.domains.some((ruleDomain) => domainMatches(domain, ruleDomain));
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.processedElements = new WeakSet();
  }
}
