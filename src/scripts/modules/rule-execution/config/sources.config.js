/**
 * Rule Execution System Configuration
 *
 * @fileoverview Factory function to create and configure the rule execution system.
 * Wires together sources, parsers, executors, and coordinator.
 *
 * @module sources.config
 */

import Logger from "@script-utils/logger.js";
import { RuleExecutionManager } from "@modules/rule-execution/core/rule-execution-manager.js";
import { PerformanceCoordinator } from "@modules/rule-execution/core/performance-coordinator.js";
import { DefaultRuleSource } from "@modules/rule-execution/sources/default-rule-source.js";
import { CustomRuleSource } from "@modules/rule-execution/sources/custom-rule-source.js";
import { EasyListDomSource } from "@modules/rule-execution/sources/easylist-dom-source.js";
import { SelectorParser } from "@modules/rule-execution/parsers/selector-parser.js";
import { EasyListDomParser } from "@modules/rule-execution/parsers/easylist-dom-parser.js";
import { SelectorExecutor } from "@modules/rule-execution/executors/selector-executor.js";
import { HybridExecutor } from "@modules/rule-execution/executors/hybrid-executor/index.js";

/**
 * Create configured RuleExecutionManager
 * @returns {Promise<RuleExecutionManager>} Configured manager instance
 */
export async function createRuleExecutionSystem() {
  Logger.info('RuleExecution:Config', 'Initializing rule execution system...');

  // Initialize sources
  const sources = new Map([
    ['default', new DefaultRuleSource()],
    ['custom', new CustomRuleSource()],
    ['easylist', new EasyListDomSource()]
  ]);

  Logger.debug(
    'RuleExecution:Config',
    `Initialized ${sources.size} sources: ${Array.from(sources.keys()).join(', ')}`
  );

  // Initialize performance coordinator
  const performanceCoordinator = new PerformanceCoordinator({
    maxFrameTime: 16, // 60fps target
    batchSize: 50,
    enableTimeSlicing: true
  });

  Logger.debug(
    'RuleExecution:Config',
    'Performance coordinator configured',
    () => performanceCoordinator.getMetrics()
  );

  // Initialize parsers (one per executor type)
  const parsers = new Map([
    ['selector', new SelectorParser()],
    ['hybrid', new EasyListDomParser()]
  ]);

  Logger.debug(
    'RuleExecution:Config',
    `Initialized ${parsers.size} parsers: ${Array.from(parsers.keys()).join(', ')}`
  );

  // Initialize executors (one per rule type)
  const executors = new Map([
    ['selector', new SelectorExecutor(performanceCoordinator)],
    ['hybrid', new HybridExecutor()]
  ]);

  Logger.debug(
    'RuleExecution:Config',
    `Initialized ${executors.size} executors: ${Array.from(executors.keys()).join(', ')}`
  );

  // Create manager
  const manager = new RuleExecutionManager(
    sources,
    executors,
    parsers,
    performanceCoordinator
  );

  Logger.info('RuleExecution:Config', 'System initialization complete');

  return manager;
}

/**
 * Configuration constants for rule sources
 */
export const RULE_EXECUTION_CONFIG = {
  default: {
    name: 'Default Selector Rules',
    storageKey: 'defaultRules',
    executorType: 'selector',
    updateInterval: 0 // No auto-updates
  },
  custom: {
    name: 'Custom Selector Rules',
    storageKey: 'customRules',
    executorType: 'selector',
    updateInterval: 0 // No auto-updates
  },
  // Future: EasyList config will be added in Phase 2
  easylist: {
    name: 'EasyList DOM Removal',
    url: 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_general_block.txt',
    storageKey: 'easylistDomRules',
    executorType: 'domain-pattern',
    updateInterval: 10080, // 7 days in minutes
    cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    maxPatterns: 5000
  }
};

/**
 * Get configuration for a specific source
 * @param {string} sourceName - Source name ('default', 'custom', 'easylist')
 * @returns {object|null} Configuration object or null if not found
 */
export function getSourceConfig(sourceName) {
  return RULE_EXECUTION_CONFIG[sourceName] || null;
}
