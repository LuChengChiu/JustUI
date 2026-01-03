/**
 * Main orchestrator for network blocking system (SRP)
 * Manages lifecycle of rule updates without knowing implementation details
 */
import Logger from "@script-utils/logger.js";

export class NetworkBlockManager {
  constructor(sources, updater, parser, converter, budgetCoordinator = null) {
    this.sources = sources;     // Array<IRuleSource>
    this.updater = updater;     // IUpdater
    this.parser = parser;       // IParser
    this.converter = converter; // RuleConverter
    this.budgetCoordinator = budgetCoordinator; // BudgetCoordinator (optional)
  }

  /**
   * Update all registered dynamic sources with budget coordination
   */
  async updateAll() {
    const dynamicSources = this.sources.filter(s => s.getUpdateType() === 'dynamic');

    // Phase 1: Fetch and count rules from all sources
    const sourceRequests = [];
    for (const source of dynamicSources) {
      const rawContent = await source.fetchRules();
      const parsedRules = await this.parser.parse(rawContent);
      sourceRequests.push({ source, ruleCount: parsedRules.length, rawContent });
    }

    // Phase 2: Allocate budget if coordinator is available
    let allocations = null;
    if (this.budgetCoordinator) {
      allocations = this.budgetCoordinator.allocateBudget(sourceRequests);
    }

    // Phase 3: Convert and update with budget limits
    const results = [];
    for (const { source, ruleCount, rawContent } of sourceRequests) {
      try {
        const allocation = allocations?.get(source.getName());
        const budgetLimit = allocation?.allocated ?? ruleCount;

        // Parse and limit rules to budget allocation
        const parsedRules = await this.parser.parse(rawContent);
        const limitedRules = parsedRules.slice(0, budgetLimit);

        // Convert to DNR format
        const dnrRules = await this.converter.convert(
          limitedRules,
          source.getRuleIdRange()
        );

        // Update via appropriate updater
        await this.updater.update(dnrRules, source.getRuleIdRange());

        results.push({
          source: source.getName(),
          success: true,
          ruleCount: dnrRules.length,  // Fixed: Use ruleCount for consistency
          allocated: dnrRules.length,
          truncated: allocation?.truncated ?? 0
        });

        Logger.info(
          "NetworkBlocking:Manager",
          `Updated ${dnrRules.length} rules for ${source.getName()}`
        );
      } catch (error) {
        results.push({ source: source.getName(), success: false, error: error.message });
        Logger.error(
          "NetworkBlocking:Manager",
          `Failed to update ${source.getName()}`,
          error
        );
      }
    }

    // Log final statistics if budget coordinator is available
    if (this.budgetCoordinator) {
      const stats = this.budgetCoordinator.getStats();
      Logger.info("NetworkBlocking:Manager", "Budget statistics", stats);
    }

    return results;
  }

  /**
   * Update a single source
   */
  async updateSource(source) {
    Logger.info("NetworkBlocking:Manager", `Updating ${source.getName()}...`);

    // Fetch raw rules
    const rawContent = await source.fetchRules();

    // Parse rules
    const parsedRules = await this.parser.parse(rawContent);

    // Convert to DNR format
    const dnrRules = await this.converter.convert(
      parsedRules,
      source.getRuleIdRange()
    );

    // Update via appropriate updater
    await this.updater.update(dnrRules, source.getRuleIdRange());

    Logger.info(
      "NetworkBlocking:Manager",
      `Updated ${dnrRules.length} rules for ${source.getName()}`
    );
    return { ruleCount: dnrRules.length };
  }

  /**
   * Update sources by schedule (daily or weekly)
   */
  async updateByInterval(intervalMinutes) {
    const matchingSources = this.sources.filter(
      s => s.getUpdateInterval() === intervalMinutes && s.getUpdateType() === 'dynamic'
    );

    for (const source of matchingSources) {
      await this.updateSource(source);
    }
  }
}
