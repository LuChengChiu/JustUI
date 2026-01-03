import Logger from "../../../utils/logger.js";
import { convertFilter } from "@eyeo/abp2dnr";

/**
 * Converts EasyList/custom rules to declarativeNetRequest format (SRP)
 */
export class RuleConverter {
  /**
   * Convert EasyList filters or JSON rules to DNR format
   * @param {Array<string|object>} rules - Rules to convert
   * @param {{ start: number, end: number }} idRange - Rule ID allocation range
   * @returns {Promise<Array>} DNR-formatted rules
   */
  async convert(rules, idRange) {
    const dnrRules = [];
    let currentId = idRange.start;
    let stats = { total: rules.length, converted: 0, failed: 0, skipped: 0 };

    for (const rule of rules) {
      try {
        // Handle different input formats
        if (typeof rule === 'string') {
          // EasyList text format - use @eyeo/abp2dnr
          try {
            const converted = await convertFilter(rule);
            if (converted && Array.isArray(converted) && converted.length > 0) {
              // @eyeo/abp2dnr returns rules WITHOUT IDs - must assign manually
              for (const dnrRule of converted) {
                dnrRule.id = currentId++;
                dnrRules.push(dnrRule);
              }
              stats.converted++;
            } else {
              // convertFilter returned null, undefined, or empty array
              stats.skipped++;
            }
          } catch (filterError) {
            // Skip invalid filters (e.g., unsupported regex patterns)
            stats.failed++;
            if (stats.failed <= 10) {
              // Only log first 10 failures to avoid spam
              Logger.warn(
                "NetworkBlocking:RuleConverter",
                `Skipping invalid filter: ${rule.substring(0, 100)}...`,
                filterError.message
              );
            }
          }
        } else if (typeof rule === 'object') {
          // JSON format (defaultBlockRequests) - convert directly
          const dnrRule = this.convertJsonRule(rule, currentId);
          if (dnrRule) {
            dnrRules.push(dnrRule);
            stats.converted++;
            currentId++;
          }
        }

        // Check if we exceeded ID range
        if (currentId > idRange.end) {
          Logger.warn(
            "NetworkBlocking:RuleConverter",
            `Rule ID exceeded range: ${currentId} > ${idRange.end}`
          );
          break;
        }
      } catch (error) {
        stats.failed++;
        Logger.warn(
          "NetworkBlocking:RuleConverter",
          "Failed to process rule",
          { rule, error: error.message }
        );
      }
    }

    Logger.info(
      "NetworkBlocking:RuleConverter",
      `Conversion stats: ${stats.converted}/${stats.total} converted, ${stats.failed} failed, ${stats.skipped} skipped`
    );
    return dnrRules;
  }

  /**
   * Convert JSON rule format to DNR format
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
