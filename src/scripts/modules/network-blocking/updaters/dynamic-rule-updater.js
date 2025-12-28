import { IUpdater } from './i-updater.js';

/**
 * Updates dynamic rules at runtime (Chrome declarativeNetRequest API)
 */
export class DynamicRuleUpdater extends IUpdater {
  async update(rules, idRange) {
    // Generate rule IDs to remove (clear old rules in this range)
    const removeRuleIds = [];
    for (let id = idRange.start; id <= idRange.end; id++) {
      removeRuleIds.push(id);
    }

    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
        addRules: rules
      });

      console.log(`✅ Updated ${rules.length} dynamic rules (ID range: ${idRange.start}-${idRange.end})`);
    } catch (error) {
      console.error('Failed to update dynamic rules:', error);
      throw error;
    }
  }
}
