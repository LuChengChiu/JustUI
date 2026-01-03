/**
 * URL Utilities
 *
 * @fileoverview Shared helpers for URL parsing and domain matching.
 * @module url-utils
 */
import Logger from "@script-utils/logger.js";

/**
 * Domain matcher for whitelist and rule evaluation.
 * @param {string} domain - Domain to check.
 * @param {string} pattern - Whitelist pattern.
 * @returns {boolean} True if domain matches pattern.
 */
export function domainMatches(domain, pattern) {
  if (!domain || !pattern) {
    return false;
  }

  if (domain === pattern) {
    return true;
  }

  if (pattern.startsWith("*.")) {
    const baseDomain = pattern.slice(2);
    return domain === baseDomain || domain.endsWith("." + baseDomain);
  }

  return domain.endsWith("." + pattern);
}

/**
 * Safely parse a URL with consistent error handling.
 * @param {string} input - URL or path to parse.
 * @param {string} [base] - Optional base URL for relative inputs.
 * @param {Object} [options] - Logging options.
 * @param {string} [options.context='URL parse'] - Context string for logs.
 * @param {string} [options.level='warn'] - Console level or 'silent'.
 * @param {string} [options.prefix='OriginalUI'] - Log prefix.
 * @returns {URL|null} Parsed URL or null on failure.
 */
export function safeParseUrl(input, base, options = {}) {
  const {
    context = "URL parse",
    level = "warn",
    prefix = "OriginalUI",
  } = options;

  try {
    return base ? new URL(input, base) : new URL(input);
  } catch (error) {
    if (level !== "silent") {
      const category = `${prefix}:URLParse`;
      const message = `Failed to parse URL for ${context}`;
      const metadata = { input, base };

      const logHandlers = {
        error: Logger.error,
        warn: Logger.warn,
        info: Logger.info,
        debug: Logger.debug,
      };

      const log = logHandlers[level] || Logger.warn;
      log(category, message, error, metadata);
    }
    return null;
  }
}

/**
 * Normalize and validate an origin string.
 * Returns canonical origin string or null if invalid.
 *
 * @param {string} origin
 * @returns {string|null}
 */
export function normalizeOrigin(origin) {
  if (typeof origin !== "string") {
    return null;
  }

  const trimmed = origin.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "null") {
    return "null";
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch (error) {
    return null;
  }

  if (url.origin === "null") {
    return null;
  }

  const hasPath = url.pathname && url.pathname !== "/";
  if (hasPath || url.search || url.hash) {
    return null;
  }

  return url.origin;
}
