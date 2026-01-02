/**
 * Rule Execution Manager
 *
 * @fileoverview Main orchestrator for DOM rule execution system.
 * Coordinates sources, parsers, executors, and performance optimization.
 *
 * @module rule-execution-manager
 */

/**
 * Main orchestrator for rule execution
 */
export class RuleExecutionManager {
  /**
   * @param {Map<string, IDomRuleSource>} sources - Map of source name → source instance
   * @param {Map<string, Executor>} executors - Map of executor type → executor instance
   * @param {Map<string, Parser>} parsers - Map of parser type → parser instance
   * @param {PerformanceCoordinator} performanceCoordinator - Performance optimization
   */
  constructor(sources, executors, parsers, performanceCoordinator) {
    this.sources = sources;
    this.executors = executors;
    this.parsers = parsers;
    this.performanceCoordinator = performanceCoordinator;

    // Statistics
    this.stats = {
      totalExecutions: 0,
      totalRemoved: 0,
      bySource: new Map(),
      lastExecution: null
    };
  }

  /**
   * Execute all enabled rule sources
   * @param {string} currentDomain - Current page domain
   * @param {object} options - Execution options
   * @param {string[]} [options.enabledSources] - Sources to execute ['default', 'custom']
   * @param {boolean} [options.timeSlicing=true] - Enable time-slicing
   * @param {number} [options.maxExecutionTime=16] - Max time per frame (ms)
   * @returns {Promise<ExecutionResults>} Execution results with statistics
   */
  async executeAllRules(currentDomain, options = {}) {
    const {
      enabledSources = ['default', 'custom'],
      timeSlicing = true,
      maxExecutionTime = 16
    } = options;

    const results = {
      defaultRulesRemoved: 0,
      customRulesRemoved: 0,
      easylistRulesRemoved: 0,
      easylistRulesHidden: 0,
      executionTimeMs: 0,
      errors: []
    };

    const startTime = performance.now();

    console.log(`RuleExecution: Executing ${enabledSources.length} sources for domain: ${currentDomain}`);

    // Execute each enabled source
    for (const sourceName of enabledSources) {
      try {
        const removed = await this.executeSource(
          sourceName,
          currentDomain,
          { timeSlicing, maxExecutionTime }
        );

        // Map to result keys
        const resultKey = this.getResultKey(sourceName);
        if (resultKey) {
          results[resultKey] = removed;
        }

        // For easylist, get detailed stats (removed vs hidden)
        if (sourceName === 'easylist') {
          const executor = this.executors.get('hybrid');
          if (executor && typeof executor.getStats === 'function') {
            const detailedStats = executor.getStats();
            results.easylistRulesRemoved = detailedStats.removed || 0;
            results.easylistRulesHidden = detailedStats.hidden || 0;
          }
        }

        // Update stats
        this.updateSourceStats(sourceName, removed);

      } catch (error) {
        console.error(`RuleExecution: Error executing source "${sourceName}":`, error);
        results.errors.push({ source: sourceName, error: error.message });
      }

      // Yield between sources if time-slicing enabled
      if (timeSlicing) {
        await this.performanceCoordinator.yieldIfNeeded(startTime, maxExecutionTime);
      }
    }

    results.executionTimeMs = performance.now() - startTime;

    // Update global stats
    this.stats.totalExecutions++;
    this.stats.totalRemoved += Object.values(results).reduce(
      (sum, val) => sum + (typeof val === 'number' ? val : 0),
      0
    );
    this.stats.lastExecution = Date.now();

    console.log(`RuleExecution: Completed in ${results.executionTimeMs.toFixed(2)}ms`, results);

    return results;
  }

  /**
   * Execute a single rule source
   * @param {string} sourceName - Name of source ('default', 'custom', 'easylist')
   * @param {string} currentDomain - Current page domain
   * @param {object} options - Execution options
   * @returns {Promise<number>} Number of elements removed
   */
  async executeSource(sourceName, currentDomain, options = {}) {
    // Get source
    const source = this.sources.get(sourceName);
    if (!source) {
      throw new Error(`Source "${sourceName}" not found`);
    }

    // Check if source is enabled via storage
    const enabled = await this.isSourceEnabled(sourceName);
    if (!enabled) {
      console.log(`RuleExecution: Source "${sourceName}" is disabled`);
      return 0;
    }

    // Fetch rules from source
    const rawRules = await source.fetchRules();
    if (!rawRules || rawRules.length === 0) {
      console.log(`RuleExecution: No rules from source "${sourceName}"`);
      return 0;
    }

    // Get appropriate parser
    const executorType = source.getExecutorType();
    const parser = this.parsers.get(executorType);
    if (!parser) {
      throw new Error(`Parser for type "${executorType}" not found`);
    }

    // Parse rules
    const parsedRules = await parser.parse(rawRules);
    if (!parsedRules || parsedRules.length === 0) {
      console.log(`RuleExecution: No valid rules after parsing from "${sourceName}"`);
      return 0;
    }

    // Get appropriate executor
    const executor = this.executors.get(executorType);
    if (!executor) {
      throw new Error(`Executor for type "${executorType}" not found`);
    }

    // Execute rules
    const removed = await executor.execute(parsedRules, currentDomain, options);

    console.log(`RuleExecution: ${source.getName()} removed ${removed} elements`);

    return removed;
  }

  /**
   * Check if source is enabled via storage
   * @param {string} sourceName - Source name
   * @returns {Promise<boolean>} True if enabled
   */
  async isSourceEnabled(sourceName) {
    // Map source names to storage keys
    const storageKeyMap = {
      'default': 'defaultRulesEnabled',
      'custom': 'customRulesEnabled',
      'easylist': 'easylistEnabled'
    };

    const storageKey = storageKeyMap[sourceName];
    if (!storageKey) {
      return true; // Unknown sources are enabled by default
    }

    try {
      // Import safeStorageGet dynamically to avoid circular deps
      const { safeStorageGet } = await import('@script-utils/chrome-api-safe.js');
      const result = await safeStorageGet([storageKey]);
      return result[storageKey] !== false; // Default to true if not set
    } catch (error) {
      console.error(`RuleExecution: Error checking if source "${sourceName}" is enabled:`, error);
      return true; // Fail open
    }
  }

  /**
   * Map source name to result key
   * @param {string} sourceName - Source name
   * @returns {string|null} Result key or null
   */
  getResultKey(sourceName) {
    const keyMap = {
      'default': 'defaultRulesRemoved',
      'custom': 'customRulesRemoved',
      'easylist': 'easylistRulesRemoved'
    };
    return keyMap[sourceName] || null;
  }

  /**
   * Update statistics for a source
   * @param {string} sourceName - Source name
   * @param {number} removed - Elements removed
   */
  updateSourceStats(sourceName, removed) {
    if (!this.stats.bySource.has(sourceName)) {
      this.stats.bySource.set(sourceName, {
        executions: 0,
        totalRemoved: 0,
        lastExecution: null
      });
    }

    const sourceStats = this.stats.bySource.get(sourceName);
    sourceStats.executions++;
    sourceStats.totalRemoved += removed;
    sourceStats.lastExecution = Date.now();
  }

  /**
   * Force update (refresh) a rule source
   * @param {string} sourceName - Source name to update
   * @returns {Promise<void>}
   */
  async updateSource(sourceName) {
    const source = this.sources.get(sourceName);
    if (!source) {
      throw new Error(`Source "${sourceName}" not found`);
    }

    console.log(`RuleExecution: Forcing update for source "${sourceName}"`);

    // Invalidate cache if source supports it
    if (typeof source.invalidateCache === 'function') {
      source.invalidateCache();
    }

    // Force fetch
    await source.fetchRules();

    console.log(`RuleExecution: Source "${sourceName}" updated successfully`);
  }

  /**
   * Get execution statistics
   * @returns {object} Statistics object
   */
  getStatistics() {
    return {
      ...this.stats,
      bySource: Object.fromEntries(this.stats.bySource),
      performanceMetrics: this.performanceCoordinator.getMetrics()
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    console.log('RuleExecution: Cleaning up manager resources');

    // Cleanup executors
    this.executors.forEach((executor, type) => {
      if (typeof executor.cleanup === 'function') {
        executor.cleanup();
      }
    });

    // Reset stats
    this.stats = {
      totalExecutions: 0,
      totalRemoved: 0,
      bySource: new Map(),
      lastExecution: null
    };
  }
}

/**
 * @typedef {object} ExecutionResults
 * @property {number} defaultRulesRemoved - Elements removed by default rules
 * @property {number} customRulesRemoved - Elements removed by custom rules
 * @property {number} easylistRulesRemoved - Elements removed by EasyList (iframes, scripts)
 * @property {number} easylistRulesHidden - Elements hidden by EasyList (divs, spans - framework-safe)
 * @property {number} executionTimeMs - Total execution time
 * @property {Array} errors - Errors encountered during execution
 */
