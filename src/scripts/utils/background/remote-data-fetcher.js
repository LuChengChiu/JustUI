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
 * console.log('Loaded rules:', rules.length);
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
 * console.log('Loaded rules:', rules.length);
 */
export async function fetchDefaultRules() {
  // NOTE: Remote fetching is currently disabled - uncomment to enable
  // try {
  //   // Try to fetch from remote URL first
  //   const response = await fetch(REMOTE_URLS.RULES);
  //   if (response.ok) {
  //     const remoteRules = await response.json();
  //     console.log("OriginalUI: Fetched rules from remote URL", remoteRules);
  //     return remoteRules;
  //   }
  // } catch (error) {
  //   console.log(
  //     "OriginalUI: Failed to fetch remote rules, falling back to local:",
  //     error.message
  //   );
  // }

  // Fallback to local default rules
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultRules.json")
    );
    const localRules = await localResponse.json();
    console.log("OriginalUI: Using local default rules", localRules);
    return localRules;
  } catch (error) {
    console.error("OriginalUI: Failed to load local default rules:", error);
    return [];
  }
}

/**
 * Fetch default whitelist from remote URL with fallback to local file
 * @returns {Promise<Array>} Array of whitelisted domains (empty array on failure)
 *
 * @example
 * const whitelist = await fetchDefaultWhitelist();
 * console.log('Loaded whitelist:', whitelist.length);
 */
export async function fetchDefaultWhitelist() {
  // NOTE: Remote fetching is currently disabled - uncomment to enable
  // try {
  //   // Try to fetch from remote URL first
  //   const response = await fetch(REMOTE_URLS.WHITELIST);
  //   if (response.ok) {
  //     const remoteWhitelist = await response.json();
  //     console.log("OriginalUI: Fetched whitelist from remote URL", remoteWhitelist);
  //     return remoteWhitelist;
  //   }
  // } catch (error) {
  //   console.log(
  //     "OriginalUI: Failed to fetch remote whitelist, falling back to local:",
  //     error.message
  //   );
  // }

  // Fallback to local default whitelist
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultWhitelist.json")
    );
    const localWhitelist = await localResponse.json();
    console.log("OriginalUI: Using local default whitelist", localWhitelist);
    return localWhitelist;
  } catch (error) {
    console.error("OriginalUI: Failed to load local default whitelist:", error);
    return [];
  }
}

/**
 * Fetch both rules and whitelist in parallel for efficiency
 * @returns {Promise<Object>} Object with rules and whitelist arrays
 *
 * @example
 * const { rules, whitelist } = await fetchAllDefaults();
 * console.log(`Loaded ${rules.length} rules and ${whitelist.length} whitelist entries`);
 */
export async function fetchAllDefaults() {
  const [rules, whitelist] = await Promise.all([
    fetchDefaultRules(),
    fetchDefaultWhitelist(),
  ]);

  return { rules, whitelist };
}
