import Logger from "@script-utils/logger.js";
import { IRuleSource } from "./i-rule-source.js";

/**
 * Custom user patterns source from chrome.storage
 * Highest priority source for user-defined blocking patterns
 */
export class CustomPatternSource extends IRuleSource {
  constructor(name, idStart, idEnd, updateInterval = 0) {
    super();
    this.name = name;
    this.idRange = { start: idStart, end: idEnd };
    this.updateInterval = updateInterval; // 0 = manual updates only
  }

  async fetchRules() {
    const { networkBlockPatterns = [] } = await chrome.storage.sync.get(['networkBlockPatterns']);

    // Handle null or non-array patterns
    const patterns = Array.isArray(networkBlockPatterns) ? networkBlockPatterns : [];

    // Enforce 5,000 pattern limit (ID range capacity)
    if (patterns.length > 5000) {
      Logger.warn(
        "NetworkBlocking:CustomPatternSource",
        `Custom patterns exceed capacity (${patterns.length}/5000). ` +
          "Only first 5000 will be applied."
      );
    }

    // Convert string patterns to JSON rule format
    return patterns.slice(0, 5000).map((pattern, index) => ({
      id: `custom_${index}`,
      trigger: pattern,
      category: 'custom',
      severity: 'critical', // Highest DNR priority
      description: 'User-defined custom blocking pattern',
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script'],
      isRegex: false
    }));
  }

  getRuleIdRange() {
    return this.idRange;
  }

  getUpdateInterval() {
    return this.updateInterval;
  }

  getName() {
    return this.name;
  }

  getUpdateType() {
    return 'dynamic';
  }
}
