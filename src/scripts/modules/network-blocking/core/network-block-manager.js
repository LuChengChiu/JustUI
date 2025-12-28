/**
 * Main orchestrator for network blocking system (SRP)
 * Manages lifecycle of rule updates without knowing implementation details
 */
export class NetworkBlockManager {
  constructor(sources, updater, parser, converter) {
    this.sources = sources;     // Array<IRuleSource>
    this.updater = updater;     // IUpdater
    this.parser = parser;       // IParser
    this.converter = converter; // RuleConverter
  }

  /**
   * Update all registered dynamic sources
   */
  async updateAll() {
    const dynamicSources = this.sources.filter(s => s.getUpdateType() === 'dynamic');
    const results = [];

    for (const source of dynamicSources) {
      try {
        const result = await this.updateSource(source);
        results.push({ source: source.getName(), success: true, ...result });
      } catch (error) {
        results.push({ source: source.getName(), success: false, error: error.message });
        console.error(`Failed to update ${source.getName()}:`, error);
      }
    }

    return results;
  }

  /**
   * Update a single source
   */
  async updateSource(source) {
    console.log(`🔄 Updating ${source.getName()}...`);

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

    console.log(`✅ Updated ${dnrRules.length} rules for ${source.getName()}`);
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
