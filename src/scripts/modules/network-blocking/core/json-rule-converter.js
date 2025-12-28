/**
 * Converts JSON rules to declarativeNetRequest format
 * Browser-compatible (no native dependencies)
 */
export class JsonRuleConverter {
  /**
   * Convert JSON rules to DNR format
   * @param {Array<object>} rules - JSON rule objects
   * @param {{ start: number, end: number }} idRange - Rule ID allocation range
   * @returns {Promise<Array>} DNR-formatted rules
   */
  async convert(rules, idRange) {
    const dnrRules = [];
    let currentId = idRange.start;
    let stats = { total: rules.length, converted: 0, failed: 0 };

    for (const rule of rules) {
      try {
        if (typeof rule === 'object' && rule !== null) {
          const dnrRule = this.convertJsonRule(rule, currentId);
          if (dnrRule) {
            dnrRules.push(dnrRule);
            stats.converted++;
            currentId++;
          }
        } else {
          stats.failed++;
          console.warn('Invalid rule format:', rule);
        }

        // Check if we exceeded ID range
        if (currentId > idRange.end) {
          console.warn(`Rule ID exceeded range: ${currentId} > ${idRange.end}`);
          break;
        }
      } catch (error) {
        stats.failed++;
        console.warn('Failed to convert rule:', rule, error);
      }
    }

    console.log(`JSON conversion stats: ${stats.converted}/${stats.total} converted, ${stats.failed} failed`);
    return dnrRules;
  }

  /**
   * Convert single JSON rule to DNR format
   * @param {object} rule - JSON rule object
   * @param {number} id - Rule ID
   * @returns {object} DNR rule
   */
  convertJsonRule(rule, id) {
    return {
      id,
      priority: rule.severity === 'critical' ? 3 : rule.severity === 'high' ? 2 : 1,
      action: { type: 'block' },
      condition: {
        urlFilter: rule.isRegex ? undefined : `*://*${rule.trigger}/*`,
        regexFilter: rule.isRegex ? rule.trigger : undefined,
        resourceTypes: rule.resourceTypes || ['xmlhttprequest', 'script', 'sub_frame']
      }
    };
  }
}
