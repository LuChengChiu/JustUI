/**
 * Message Validation Utilities for Background Script
 * Security-focused validation for Chrome extension messaging
 *
 * @fileoverview Provides comprehensive validation for message senders and inputs
 * to ensure security and prevent malicious or malformed requests. All validators
 * are stateless pure functions.
 *
 * @example
 * // Validate extension sender
 * if (!isValidExtensionSender(sender)) {
 *   return { success: false, error: 'Invalid sender' };
 * }
 *
 * @example
 * // Validate trusted UI sender
 * if (!isTrustedUISender(sender)) {
 *   return { success: false, error: 'Unauthorized' };
 * }
 *
 * @example
 * // Validate domain format
 * if (!isValidDomain(request.domain)) {
 *   return { success: false, error: 'Invalid domain format' };
 * }
 *
 * @module MessageValidators
 * @since 1.0.0
 * @author OriginalUI Team
 */

/**
 * Validate that message sender is from this extension
 * @param {object} sender - Message sender object
 * @returns {boolean} True if sender is valid
 *
 * @example
 * if (!isValidExtensionSender(sender)) {
 *   Logger.warn('MessageValidation', 'Invalid extension sender');
 *   return { success: false, error: 'Invalid sender' };
 * }
 */
import Logger from "../logger.js";
export function isValidExtensionSender(sender) {
  if (!sender || !sender.id) {
    Logger.warn("MessageValidation", "Rejected message - no sender ID");
    return false;
  }

  if (sender.id !== chrome.runtime.id) {
    Logger.warn("MessageValidation", "Rejected message - sender ID mismatch", {
      senderId: sender.id,
    });
    return false;
  }

  return true;
}

/**
 * Validate that sender is from popup or settings page
 * @param {object} sender - Message sender object
 * @returns {boolean} True if sender is from trusted UI page
 *
 * @example
 * // Only allow actions from trusted UI pages
 * if (!isTrustedUISender(sender)) {
 *   return { success: false, error: 'Unauthorized - must be from popup or settings' };
 * }
 */
export function isTrustedUISender(sender) {
  if (!isValidExtensionSender(sender)) {
    return false;
  }

  const url = sender.url || "";
  const trustedPages = [
    chrome.runtime.getURL("popup.html"),
    chrome.runtime.getURL("settings.html"),
    chrome.runtime.getURL("settings-beta.html"),
  ];

  const isTrusted = trustedPages.some((page) => url.startsWith(page));

  if (!isTrusted) {
    Logger.warn("MessageValidation", "Rejected message - sender not from trusted UI", {
      url,
    });
  }

  return isTrusted;
}

/**
 * Validate domain string format with full IDN support
 * Supports ASCII domains, Punycode (xn--), Unicode/IDN domains, and wildcards
 *
 * This implementation follows RFC 1034, RFC 1035, RFC 3492 (Punycode),
 * and RFC 5890 (IDNA) specifications for proper domain validation.
 *
 * @param {string} domain - Domain to validate (ASCII, Punycode, or Unicode)
 * @returns {boolean} True if domain is valid
 *
 * @example
 * // ASCII domains
 * isValidDomain('example.com')           // true
 * isValidDomain('*.example.com')         // true (wildcard allowed)
 *
 * // Punycode (IDN encoded)
 * isValidDomain('xn--mnchen-3ya.de')     // true (münchen.de in Punycode)
 * isValidDomain('xn--wgbh1c.ae')         // true (مصر.ae in Punycode)
 *
 * // Unicode/IDN domains
 * isValidDomain('münchen.de')            // true (German)
 * isValidDomain('日本.jp')                // true (Japanese)
 * isValidDomain('مصر.ae')                 // true (Arabic)
 *
 * // Invalid domains
 * isValidDomain('invalid..domain')       // false (consecutive dots)
 * isValidDomain('')                      // false (empty)
 * isValidDomain('.example.com')          // false (leading dot)
 * isValidDomain('example.com.')          // false (trailing dot)
 */
export function isValidDomain(domain) {
  // Type and basic length validation
  if (typeof domain !== "string" || !domain) {
    return false;
  }

  // RFC 1034: Maximum domain length is 253 characters
  if (domain.length > 253) {
    return false;
  }

  // Extract wildcard prefix if present
  let domainToValidate = domain;
  let hasWildcard = false;

  if (domain.startsWith('*.')) {
    hasWildcard = true;
    domainToValidate = domain.substring(2);
  }

  // Validate remaining domain after wildcard removal
  if (!domainToValidate) {
    return false;
  }

  // Split into labels (parts separated by dots)
  const labels = domainToValidate.split('.');

  // Must have at least one label (e.g., "localhost" or "example.com")
  if (labels.length === 0) {
    return false;
  }

  // Validate each label
  for (const label of labels) {
    // RFC 1034: Labels must be 1-63 characters
    if (!label || label.length > 63) {
      return false;
    }

    // Check for invalid patterns
    if (label.startsWith('-') || label.endsWith('-')) {
      return false; // RFC 1034: Labels cannot start or end with hyphen
    }

    // Check if label is Punycode (xn--*)
    const isPunycode = label.startsWith('xn--');

    if (isPunycode) {
      // Validate Punycode format: xn-- followed by ASCII alphanumeric and hyphens
      // Basic validation - full Punycode decoding would require a library
      const punycodeBody = label.substring(4);
      if (!punycodeBody || !/^[a-z0-9-]+$/i.test(punycodeBody)) {
        return false;
      }
    } else {
      // For non-Punycode labels, allow:
      // 1. ASCII alphanumeric and hyphens (traditional domains)
      // 2. Unicode characters (IDN domains)
      //
      // We use a comprehensive Unicode property escape to allow all valid
      // Unicode letters, marks, and numbers per IDNA2008 specification
      const validLabelPattern = /^[\p{L}\p{M}\p{N}-]+$/u;

      if (!validLabelPattern.test(label)) {
        return false;
      }
    }
  }

  // Additional validation: Try creating a URL object to leverage browser's
  // built-in IDN handling and validation (defensive validation layer)
  try {
    // Use dummy protocol for validation
    const testUrl = new URL(`https://${domainToValidate}`);

    // Verify the hostname matches our input (handles IDN normalization)
    // Browser will automatically convert Unicode to Punycode internally
    if (!testUrl.hostname) {
      return false;
    }

    // Ensure no path, query, or fragment was parsed (would indicate invalid domain)
    if (testUrl.pathname !== '/' || testUrl.search || testUrl.hash) {
      return false;
    }
  } catch (error) {
    // URL constructor failed - invalid domain format
    return false;
  }

  return true;
}

/**
 * Validate URL format
 * @param {string} url - URL string to validate
 * @returns {boolean} True if URL is valid
 *
 * @example
 * isValidURL('https://example.com')       // true
 * isValidURL('chrome-extension://abc123') // true
 * isValidURL('not a url')                 // false
 */
export function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validate request structure has required 'action' field
 * @param {object} request - Request object
 * @returns {boolean} True if request has valid structure
 *
 * @example
 * isValidRequestStructure({ action: 'updateWhitelist' })  // true
 * isValidRequestStructure({ data: 'test' })               // false (no action)
 * isValidRequestStructure(null)                           // false
 */
export function isValidRequestStructure(request) {
  return !!(request && typeof request.action === "string");
}
