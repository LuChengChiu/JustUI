/**
 * Remote Data Fetcher for Default Rules and Whitelist
 * Handles fetching from remote URLs with local file fallback
 *
 * @fileoverview Provides resilient data fetching with graceful degradation.
 * Attempts remote fetch first, falls back to local files if remote fails.
 * Always returns valid data (empty array on total failure).
 *
 * @example
 * // Fetch default rules
 * const rules = await fetchDefaultRules();
 * Logger.info('DefaultRulesFetch', 'Loaded rules', { count: rules.length });
 *
 * @example
 * // Fetch both rules and whitelist in parallel
 * const { rules, whitelist } = await fetchAllDefaults();
 *
 * @module RemoteDataFetcher
 * @since 1.0.0
 * @author OriginalUI Team
 */

/**
 * Remote URLs for default data
 * @constant
 * @type {Object}
 * @property {string} RULES - Remote URL for default rules JSON
 * @property {string} WHITELIST - Remote URL for default whitelist JSON
 */
export const REMOTE_URLS = {
  RULES:
    "https://raw.githubusercontent.com/LuChengChiu/OriginalUI/main/src/data/defaultRules.json",
  WHITELIST:
    "https://raw.githubusercontent.com/LuChengChiu/OriginalUI/main/src/data/defaultWhitelist.json",
};

/**
 * Fetch default rules from remote URL with fallback to local file
 * @returns {Promise<Array>} Array of rule objects (empty array on failure)
 *
 * @example
 * const rules = await fetchDefaultRules();
 * Logger.info('DefaultRulesFetch', 'Loaded rules', { count: rules.length });
 */
import Logger from "../logger.js";
export async function fetchDefaultRules() {
  try {
    // Try to fetch from remote URL first
    const response = await fetch(REMOTE_URLS.RULES);
    if (response.ok) {
      const remoteRules = await response.json();
      Logger.info(
        "DefaultRulesFetch",
        "Fetched rules from remote URL",
        remoteRules
      );
      return remoteRules;
    }
  } catch (error) {
    Logger.warn(
      "DefaultRulesFetch",
      "Failed to fetch remote rules, falling back to local",
      error
    );
  }

  // Fallback to local default rules
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultRules.json")
    );
    const localRules = await localResponse.json();
    Logger.info("DefaultRulesFetch", "Using local default rules", {
      count: localRules.length,
    });
    return localRules;
  } catch (error) {
    Logger.error(
      "DefaultRulesFetch",
      "Failed to load local default rules",
      error
    );
    return [];
  }
}

/**
 * Fetch default whitelist from remote URL with fallback to local file
 * @returns {Promise<Array>} Array of whitelisted domains (empty array on failure)
 *
 * @example
 * const whitelist = await fetchDefaultWhitelist();
 * Logger.info('DefaultWhitelistFetch', 'Loaded whitelist', { count: whitelist.length });
 */
export async function fetchDefaultWhitelist() {
  try {
    // Try to fetch from remote URL first
    const response = await fetch(REMOTE_URLS.WHITELIST);
    if (response.ok) {
      const remoteWhitelist = await response.json();
      Logger.info(
        "DefaultWhitelistFetch",
        "Fetched whitelist from remote URL",
        remoteWhitelist
      );
      return remoteWhitelist;
    }
  } catch (error) {
    Logger.warn(
      "DefaultWhitelistFetch",
      "Failed to fetch remote whitelist, falling back to local",
      error
    );
  }

  // Fallback to local default whitelist
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultWhitelist.json")
    );
    const localWhitelist = await localResponse.json();
    Logger.info("DefaultWhitelistFetch", "Using local default whitelist", {
      count: localWhitelist.length,
    });
    return localWhitelist;
  } catch (error) {
    Logger.error(
      "DefaultWhitelistFetch",
      "Failed to load local default whitelist",
      error
    );
    return [];
  }
}

/**
 * Fetch both rules and whitelist in parallel for efficiency
 * @returns {Promise<Object>} Object with rules and whitelist arrays
 *
 * @example
 * const { rules, whitelist } = await fetchAllDefaults();
 * Logger.info('DefaultDataFetch', 'Loaded default data', {
 *   rules: rules.length,
 *   whitelist: whitelist.length
 * });
 */
export async function fetchAllDefaults() {
  const [rules, whitelist] = await Promise.all([
    fetchDefaultRules(),
    fetchDefaultWhitelist(),
  ]);

  return { rules, whitelist };
}
