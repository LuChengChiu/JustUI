/**
 * Global budget coordinator for priority-based rule allocation
 * Enforces Chrome's 30,000 dynamic rule limit across all sources
 */
import Logger from "@script-utils/logger.js";

export class BudgetCoordinator {
  constructor(maxDynamicRules = 30000) {
    this.maxDynamicRules = maxDynamicRules;
    this.allocations = new Map();
  }

  /**
   * Allocate budget to sources based on priority order
   * Sources array must be pre-sorted by priority
   *
   * @param {Array<{source: IRuleSource, ruleCount: number}>} sourceRequests
   * @returns {Map<string, {allocated: number, truncated: number, idRange: object, priority: number}>}
   */
  allocateBudget(sourceRequests) {
    let remainingBudget = this.maxDynamicRules;
    const allocations = new Map();

    for (let i = 0; i < sourceRequests.length; i++) {
      const { source, ruleCount } = sourceRequests[i];
      const sourceName = source.getName();
      const idRange = source.getRuleIdRange();
      const maxCapacity = idRange.end - idRange.start + 1;

      // Calculate allocation
      const requested = Math.min(ruleCount, maxCapacity);
      const allocated = Math.min(requested, remainingBudget);
      const truncated = requested - allocated;

      allocations.set(sourceName, {
        allocated,
        truncated,
        idRange,
        priority: i + 1
      });

      remainingBudget -= allocated;

      // Log allocation
      if (truncated > 0) {
        Logger.warn(
          "NetworkBlocking:BudgetCoordinator",
          `Budget exceeded for ${sourceName}: ` +
            `Allocated ${allocated}/${requested} rules, ${truncated} truncated`
        );
      } else {
        Logger.info(
          "NetworkBlocking:BudgetCoordinator",
          `Allocated ${allocated} rules to ${sourceName}`
        );
      }

      if (remainingBudget <= 0) {
        Logger.warn(
          "NetworkBlocking:BudgetCoordinator",
          `Budget exhausted at ${sourceName}. Remaining sources will be skipped.`
        );
        break;
      }
    }

    this.allocations = allocations;
    return allocations;
  }

  /**
   * Get allocation statistics
   *
   * @returns {object} Statistics object with totals and per-source breakdowns
   */
  getStats() {
    const stats = {
      totalAllocated: 0,
      totalTruncated: 0,
      budgetRemaining: this.maxDynamicRules,
      bySource: {}
    };

    for (const [sourceName, allocation] of this.allocations) {
      stats.totalAllocated += allocation.allocated;
      stats.totalTruncated += allocation.truncated;
      stats.bySource[sourceName] = allocation;
    }

    stats.budgetRemaining = this.maxDynamicRules - stats.totalAllocated;
    return stats;
  }
}
