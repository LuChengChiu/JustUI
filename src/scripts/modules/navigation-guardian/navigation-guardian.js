/**
 * NavigationGuardian Module - Comprehensive cross-origin navigation protection
 *
 * @fileoverview Provides multi-layered protection against malicious navigation attempts including
 * pop-unders, redirects, and cross-origin attacks. Features intelligent modal confirmation system,
 * whitelist management, and comprehensive statistics tracking with memory leak prevention.
 *
 * Now modularized with SecurityValidator and ModalManager for improved maintainability.
 *
 * @example
 * // Basic initialization
 * const guardian = new NavigationGuardian();
 * guardian.initialize(['trusted-site.com'], { blockedCount: 0, allowedCount: 0 });
 *
 * @example
 * // Enable/disable protection
 * guardian.setEnabled(false); // Temporarily disable
 * guardian.setEnabled(true);  // Re-enable protection
 *
 * @example
 * // Access statistics and cleanup
 * const stats = guardian.getNavigationStats();
 * Logger.info('NavigationGuardianStats', 'Navigation Guardian stats', stats);
 * guardian.cleanup(); // Clean up resources
 *
 * @module NavigationGuardian
 * @extends CleanableModule
 * @since 1.0.0
 * @author OriginalUI Team
 */

import Logger from "@script-utils/logger.js";
import {
  isExtensionContextValid,
  safeStorageSet,
} from "@script-utils/chrome-api-safe.js";
import { domainMatches, safeParseUrl } from "@utils/url-utils.js";
import { ModalManager } from "./modal-manager.js";
import { SecurityValidator } from "./security-validator.js";

/**
 * NavigationGuardian class providing comprehensive cross-origin navigation protection
 * @class
 */
export class NavigationGuardian {
  /**
   * Create a NavigationGuardian instance
   * @constructor
   */
  constructor() {
    /**
     * Security validator for URL and threat validation
     * @type {SecurityValidator}
     * @private
     */
    this.securityValidator = new SecurityValidator();

    /**
     * Modal manager for UI confirmation modals
     * @type {ModalManager}
     * @private
     */
    this.modalManager = new ModalManager();

    /**
     * Enable/disable state for navigation protection
     * @type {boolean}
     * @private
     */
    this.isEnabled = true;

    /**
     * Navigation attempt statistics
     * @type {Object}
     * @property {number} blockedCount - Total blocked navigation attempts
     * @property {number} allowedCount - Total allowed navigation attempts
     * @private
     */
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };

    /**
     * Map for string-keyed modal tracking with size limits
     * @type {Map<string, Object>}
     * @private
     */
    this.pendingModalKeys = new Map(); // Separate storage for string keys with limits

    /**
     * Array of whitelisted domains that bypass navigation protection
     * @type {string[]}
     * @private
     */
    this.whitelist = [];

    /**
     * Cached whitelist lookup for performance optimization
     * @type {Set<string>|null}
     * @private
     */
    this.whitelistCache = null;

    /**
     * Registered event listeners for cleanup tracking
     * @type {Array<Object>}
     * @private
     */
    this.eventListeners = [];
    this._isEventListenersSetup = false;

    /**
     * Enhanced modal cache management configuration
     * @type {Object}
     * @property {number} maxModalCache - Maximum pending modals (50)
     * @property {number} modalCacheTimeout - Modal timeout in ms (30s)
     * @property {number|null} modalCleanupTimer - Cleanup timer ID
     * @property {Object} modalCacheStats - Cache statistics
     * @private
     */
    this.maxModalCache = 50; // Limit pending modals to prevent memory bloat
    this.modalCacheTimeout = 30000; // 30 second timeout for pending modals
    this.modalCleanupTimer = null;
    this.modalCacheStats = {
      totalCreated: 0,
      totalCleaned: 0,
      currentPending: 0,
      maxPendingReached: 0,
    };

    // Setup modal manager callbacks with null safety checks
    if (
      this.modalManager &&
      typeof this.modalManager.setStatisticsCallback === "function"
    ) {
      this.modalManager.setStatisticsCallback((result) => {
        // result is {allowed: boolean, remember: boolean} from showExternalLinkModal
        if (result.allowed) {
          this.navigationStats.allowedCount++;
        } else {
          this.navigationStats.blockedCount++;
        }
        this.updateNavigationStats();
      });
    } else {
      Logger.error(
        "ModalManagerNotInitialized",
        "ModalManager not properly initialized"
      );
    }

    if (
      this.modalManager &&
      typeof this.modalManager.setURLValidator === "function" &&
      this.securityValidator &&
      typeof this.securityValidator.validateURLSecurity === "function"
    ) {
      this.modalManager.setURLValidator((url) => {
        return this.securityValidator.validateURLSecurity(url);
      });
    } else {
      Logger.error(
        "ValidatorNotInitialized",
        "SecurityValidator or ModalManager not properly initialized"
      );
    }

    // Create stable bound handler references ONCE (memory leak prevention)
    // These references are reused if setupEventListeners() is called multiple times
    this._boundClickHandler = this.handleLinkClick.bind(this);
    this._boundSubmitHandler = this.handleFormSubmit.bind(this);
    this._boundMessageHandler = this.handleNavigationMessage.bind(this);

    Logger.info(
      "NavigationGuardianInit",
      "NavigationGuardian initialized with enhanced modular cleanup"
    );
  }

  /**
   * Initialize NavigationGuardian with whitelist and settings
   * @param {string[]} [whitelist=[]] - Array of trusted domains that bypass protection
   * @param {Object} [stats={blockedCount: 0, allowedCount: 0}] - Existing navigation statistics
   * @param {number} stats.blockedCount - Number of previously blocked navigation attempts
   * @param {number} stats.allowedCount - Number of previously allowed navigation attempts
   * @throws {Error} If whitelist is not an array or stats is not an object
   *
   * @example
   * // Initialize with trusted domains and existing stats
   * guardian.initialize(['google.com', 'github.com'], { blockedCount: 5, allowedCount: 10 });
   */
  initialize(whitelist = [], stats = { blockedCount: 0, allowedCount: 0 }) {
    this.whitelist = whitelist;
    this.navigationStats = stats;
    this.setupEventListeners();
    this.injectNavigationScript();
    this.startModalCacheCleanup();

    Logger.info(
      "GuardianInitialized",
      "NavigationGuardian initialized with whitelist",
      { whitelistSize: whitelist.length }
    );
  }

  /**
   * Enable NavigationGuardian protection
   */
  enable() {
    this.isEnabled = true;
    Logger.info("GuardianEnabled", "NavigationGuardian enabled");
  }

  /**
   * Disable NavigationGuardian protection
   */
  disable() {
    this.isEnabled = false;
    Logger.info("GuardianDisabled", "NavigationGuardian disabled");
  }

  /**
   * Setup event listeners for navigation interception
   * IDEMPOTENT: Safe to call multiple times (uses stable handler references)
   */
  setupEventListeners() {
    if (this._isEventListenersSetup) {
      return;
    }
    this._isEventListenersSetup = true;

    // Use stable bound references created in constructor
    // DOM will automatically deduplicate if called multiple times

    // Listen for link clicks (capture phase to intercept early)
    document.addEventListener("click", this._boundClickHandler, true);
    this.eventListeners.push({
      element: document,
      type: "click",
      handler: this._boundClickHandler,
      options: true,
    });

    // Listen for form submissions (capture phase)
    document.addEventListener("submit", this._boundSubmitHandler, true);
    this.eventListeners.push({
      element: document,
      type: "submit",
      handler: this._boundSubmitHandler,
      options: true,
    });

    // Listen for messages from injected script
    window.addEventListener("message", this._boundMessageHandler);
    this.eventListeners.push({
      element: window,
      type: "message",
      handler: this._boundMessageHandler,
      options: undefined,
    });

    Logger.debug(
      "ListenersSetup",
      "Navigation Guardian listeners setup complete"
    );
  }

  /**
   * Handle link clicks and check for cross-origin navigation
   * @param {Event} event - Click event
   */
  handleLinkClick(event) {
    if (!this.isEnabled || this.isDomainWhitelisted(this.getCurrentDomain())) {
      return;
    }

    const link = event.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || !this.isCrossOrigin(href)) return;

    // Skip if target domain is whitelisted
    if (this.isNavigationTrusted(href)) return;

    event.preventDefault();
    event.stopPropagation();

    this.showNavigationModal(href, (result) => {
      // result is {allowed: boolean, remember: boolean} from showConfirmationModal
      if (result.allowed) {
        if (link.target === "_blank") {
          window.open(href, "_blank");
        } else {
          window.location.href = href;
        }
      }
    });
  }

  /**
   * Sanitize form action URL to prevent protocol handler XSS
   * @param {string} action - Form action URL
   * @returns {string|null} Sanitized URL or null if invalid
   * @security Prevents javascript:, data:, blob: protocol attacks
   */
  sanitizeFormAction(action) {
    try {
      const url = new URL(action, window.location.href);
      // Only allow http/https protocols
      if (!["http:", "https:"].includes(url.protocol)) {
        Logger.security(
          "NonHTTPProtocolBlocked",
          "Blocked non-HTTP protocol in form action",
          { protocol: url.protocol }
        );
        return null;
      }
      return url.href;
    } catch (error) {
      Logger.error("InvalidFormActionURL", "Invalid form action URL", error, {
        action,
      });
      return null;
    }
  }

  /**
   * Create sanitized form without event handlers
   * @param {HTMLFormElement} originalForm - Original form element
   * @returns {HTMLFormElement|null} Sanitized form or null if validation fails
   * @security Prevents XSS via cloneNode, handles files, multiple values, protocol attacks
   */
  createSanitizedForm(originalForm) {
    try {
      const safeForm = document.createElement("form");

      // Sanitize and validate action URL
      const safeAction = this.sanitizeFormAction(
        originalForm.getAttribute("action") || window.location.href
      );
      if (!safeAction) {
        Logger.security(
          "MaliciousFormBlocked",
          "Blocked form with malicious action"
        );
        return null;
      }

      safeForm.action = safeAction;
      safeForm.method = ["get", "post"].includes(
        originalForm.method.toLowerCase()
      )
        ? originalForm.method.toLowerCase()
        : "get";
      safeForm.enctype =
        originalForm.enctype || "application/x-www-form-urlencoded";
      safeForm.target = originalForm.target || "_self";

      // Extract form data safely
      const formData = new FormData(originalForm);

      // Get all unique field names
      const fieldNames = new Set();
      for (const name of formData.keys()) {
        fieldNames.add(name);
      }

      // Handle multiple values per field name
      for (const name of fieldNames) {
        const values = formData.getAll(name);

        for (const value of values) {
          const input = document.createElement("input");
          input.name = name;

          // Handle file uploads correctly
          if (value instanceof File) {
            input.type = "file";
            // Use DataTransfer API to attach File object
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(value);
            input.files = dataTransfer.files;
          } else {
            // Regular text input (browser auto-escapes)
            input.type = "hidden";
            input.value = value;
          }

          safeForm.appendChild(input);
        }
      }

      return safeForm;
    } catch (error) {
      Logger.error("FormSanitizationFailed", "Form sanitization failed", error);
      return null;
    }
  }

  /**
   * Handle form submissions and check for cross-origin actions
   * @param {Event} event - Submit event
   */
  handleFormSubmit(event) {
    if (!this.isEnabled || this.isDomainWhitelisted(this.getCurrentDomain())) {
      return;
    }

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const action = form.getAttribute("action") || window.location.href;
    if (!this.isCrossOrigin(action)) return;

    // Skip if target domain is whitelisted
    if (this.isNavigationTrusted(action)) return;

    event.preventDefault();
    event.stopPropagation();

    this.showNavigationModal(action, (result) => {
      // result is {allowed: boolean, remember: boolean} from showConfirmationModal
      if (result.allowed) {
        // Create sanitized form for ALL submissions (consistent security)
        const safeForm = this.createSanitizedForm(form);

        if (!safeForm) {
          Logger.error(
            "FormSanitizeBlocked",
            "Failed to sanitize form, blocking submission"
          );
          return;
        }

        // Submit sanitized form with guaranteed cleanup to prevent DOM leaks
        try {
          if (!document.body) {
            throw new Error("Document body not available for form submission");
          }

          document.body.appendChild(safeForm);

          try {
            safeForm.submit();

            // Only remove form if target is _blank (page won't navigate away)
            // For _self target, form will be cleaned up by page navigation
            if (safeForm.target === "_blank") {
              // Small delay to ensure submission completes before cleanup
              setTimeout(() => {
                if (safeForm.parentNode) {
                  document.body.removeChild(safeForm);
                }
              }, 100);
            }
          } catch (submitError) {
            // Form submission failed - clean up immediately
            if (safeForm.parentNode) {
              document.body.removeChild(safeForm);
            }
            throw submitError;
          }
        } catch (error) {
          Logger.error("FormSubmissionError", "Form submission error", error);
          // Ensure form is removed on any error
          if (safeForm?.parentNode) {
            try {
              document.body.removeChild(safeForm);
            } catch (cleanupError) {
              Logger.warn(
                "FormCleanupFailed",
                "Form cleanup failed",
                cleanupError
              );
            }
          }
        }
      }
    });
  }

  /**
   * Handle messages from injected navigation script
   * @param {Event} event - Message event
   */
  handleNavigationMessage(event) {
    if (event.source !== window) return;

    if (event.data?.type === "NAV_GUARDIAN_CHECK") {
      const { url, messageId, popUnderAnalysis } = event.data;

      // If this messageId is already being processed, ignore duplicate
      if (this.pendingModalKeys.has(messageId)) {
        Logger.debug(
          "DuplicateNavigationRequest",
          "Ignoring duplicate navigation request",
          { messageId }
        );
        return;
      }

      let allowed = true;

      // Skip navigation protection if current domain is whitelisted
      if (this.isDomainWhitelisted(this.getCurrentDomain())) {
        Logger.info(
          "NavigationGuardian",
          "Auto-allowing navigation to whitelisted domain",
          {
            targetDomain: safeParseUrl(url, window.location.href)?.hostname,
          }
        );
        window.postMessage(
          {
            type: "NAV_GUARDIAN_RESPONSE",
            messageId: messageId,
            allowed: true,
          },
          "*"
        );
        return;
      }

      if (
        this.isEnabled &&
        this.isCrossOrigin(url) &&
        !this.isNavigationTrusted(url)
      ) {
        // Analyze URL for threats using SecurityValidator (with null safety)
        let urlAnalysis = { riskScore: 0, threats: [], isPopUnder: false }; // Default safe values

        if (
          this.securityValidator &&
          typeof this.securityValidator.analyzeThreats === "function"
        ) {
          try {
            urlAnalysis = this.securityValidator.analyzeThreats(url);
          } catch (analysisError) {
            Logger.error(
              "ThreatAnalysisError",
              "Error analyzing URL threats",
              analysisError,
              { url: url?.substring(0, 200) }
            );
            // Use default safe values and continue execution
          }
        } else {
          Logger.warn(
            "SecurityValidatorUnavailable",
            "SecurityValidator not available for threat analysis"
          );
        }

        // Combine pop-under analysis from injected script with URL analysis
        const combinedAnalysis = {
          riskScore:
            (popUnderAnalysis?.score || 0) + (urlAnalysis?.riskScore || 0),
          threats: [
            ...(popUnderAnalysis?.threats || []),
            ...(urlAnalysis?.threats || []),
          ],
          isPopUnder: popUnderAnalysis?.isPopUnder || urlAnalysis?.isPopUnder,
        };

        // Track this modal to prevent duplicates
        // Enforce cache limits before adding new entry
        this.enforcePendingModalLimits();
        this.pendingModalKeys.set(messageId, {
          timestamp: Date.now(),
          url: url,
          analysis: combinedAnalysis,
        });
        this.modalCacheStats.totalCreated++;
        this.modalCacheStats.currentPending++;

        if (
          this.modalCacheStats.currentPending >
          this.modalCacheStats.maxPendingReached
        ) {
          this.modalCacheStats.maxPendingReached =
            this.modalCacheStats.currentPending;
        }

        this.showNavigationModal(
          url,
          (result) => {
            // Destructure result object {allowed, remember}
            const { allowed: userAllowed, remember } = result;

            // Remove from pending map and update stats
            if (this.pendingModalKeys.delete(messageId)) {
              this.modalCacheStats.currentPending--;
            }

            // If remember is true, send cache update to injected script
            if (remember) {
              const sourceOrigin = window.location.origin;
              try {
                const targetOrigin = new URL(url, window.location.href).origin;

                // Send cache update message to injected-script
                window.postMessage(
                  {
                    type: "NAV_CACHE_UPDATE",
                    sourceOrigin: sourceOrigin,
                    targetOrigin: targetOrigin,
                    decision: userAllowed ? "ALLOW" : "DENY",
                    persistent: true, // 30-day TTL
                  },
                  "*"
                );

                Logger.debug(
                  "PermissionCached",
                  `Cached permission decision (${
                    userAllowed ? "ALLOW" : "DENY"
                  })`,
                  { targetOrigin }
                );
              } catch (e) {
                Logger.warn(
                  "CacheUpdateFailed",
                  "Failed to send cache update",
                  e
                );
              }
            }

            // Send response with the user's decision
            window.postMessage(
              {
                type: "NAV_GUARDIAN_RESPONSE",
                messageId: messageId,
                allowed: userAllowed,
              },
              "*"
            );
          },
          combinedAnalysis
        );
        return; // Don't send immediate response
      }

      // Send immediate response for allowed navigation
      window.postMessage(
        {
          type: "NAV_GUARDIAN_RESPONSE",
          messageId: messageId,
          allowed: allowed,
        },
        "*"
      );
    }
  }

  /**
   * Show enhanced confirmation modal with threat details using ModalManager
   * @param {string} targetURL - The target URL
   * @param {Function} callback - Callback function with user decision
   * @param {Object} threatDetails - Optional threat analysis details
   */
  showNavigationModal(targetURL, callback, threatDetails = null) {
    // Validate callback function
    if (!callback || typeof callback !== "function") {
      Logger.error(
        "InvalidCallback",
        "Invalid callback provided to showNavigationModal"
      );
      return;
    }

    // Use ModalManager for modal display
    this.modalManager
      .showConfirmationModal({
        url: targetURL,
        threatDetails: threatDetails,
      })
      .then((allowed) => {
        this.safeInvokeCallback(callback, allowed);
      })
      .catch((error) => {
        Logger.error("ModalError", "Modal error", error);
        this.safeInvokeCallback(callback, false); // Default to deny for safety
      });
  }

  /**
   * Safely invoke callback with error handling
   * @param {Function} callback - Callback function to invoke
   * @param {boolean} allowed - User decision
   * @private
   */
  safeInvokeCallback(callback, allowed) {
    try {
      callback(allowed);
    } catch (error) {
      Logger.error(
        "CallbackInvocationError",
        "Error invoking navigation callback",
        error
      );
    }
  }

  /**
   * Inject navigation script into page
   */
  injectNavigationScript() {
    try {
      // Validate Chrome extension context before using Chrome APIs
      if (!isExtensionContextValid()) {
        Logger.warn(
          "ExtensionContextInvalid",
          "Chrome extension context invalid, skipping script injection"
        );
        return;
      }

      const script = document.createElement("script");

      // Safe Chrome API call with context validation
      try {
        script.src = chrome.runtime.getURL("scripts/injected-script.js");
      } catch (apiError) {
        Logger.error("ChromeAPICallFailed", "Chrome API call failed", apiError);
        return;
      }

      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
      Logger.debug(
        "InjectedScriptLoaded",
        "Navigation Guardian injected script loaded"
      );
    } catch (error) {
      Logger.error(
        "ScriptInjectionFailed",
        "Failed to inject navigation script",
        error
      );
    }
  }

  /**
   * Update navigation statistics in storage
   */
  async updateNavigationStats() {
    try {
      // Use safe storage API with context validation and retry logic
      await safeStorageSet({ navigationStats: this.navigationStats });
    } catch (error) {
      Logger.error(
        "NavStatsUpdateFailed",
        "Failed to update navigation statistics",
        error
      );
      // Non-critical failure, continue operation
    }
  }

  /**
   * Check if URL is cross-origin
   * @param {string} url - URL to check
   * @returns {boolean} True if cross-origin
   */
  isCrossOrigin(url) {
    if (!url) return false;

    // Ignore special protocols and hash links
    if (/^(javascript|mailto|tel|data|blob|about):|^#/.test(url)) {
      return false;
    }

    const targetUrl = safeParseUrl(url, window.location.href, {
      context: "cross-origin check",
      level: "debug",
      prefix: "OriginalUI: NavigationGuardian",
    });
    if (!targetUrl) return false;
    return targetUrl.hostname !== window.location.hostname;
  }

  /**
   * Check if target domain is trusted (uses whitelist)
   * @param {string} url - URL to check
   * @returns {boolean} True if navigation is trusted
   */
  isNavigationTrusted(url) {
    if (!url) return false;

    const targetUrl = safeParseUrl(url, window.location.href, {
      context: "trusted navigation check",
      level: "debug",
      prefix: "OriginalUI: NavigationGuardian",
    });
    if (!targetUrl) return false;
    return this.isDomainWhitelisted(targetUrl.hostname);
  }

  /**
   * Check if domain is whitelisted with caching
   * @param {string} domain - Domain to check
   * @returns {boolean} True if whitelisted
   */
  isDomainWhitelisted(domain) {
    if (this.whitelistCache?.domain === domain) {
      return this.whitelistCache.result;
    }

    const result = this.whitelist.some((whitelistedDomain) =>
      domainMatches(domain, whitelistedDomain)
    );
    this.whitelistCache = { domain, result };
    return result;
  }

  /**
   * Get current domain
   * @returns {string} Current domain
   */
  getCurrentDomain() {
    const currentUrl = safeParseUrl(window.location.href, null, {
      context: "current domain lookup",
      level: "debug",
      prefix: "OriginalUI: NavigationGuardian",
    });
    return currentUrl ? currentUrl.hostname : "";
  }

  /**
   * Get current navigation statistics
   * @returns {Object} Navigation statistics
   */
  getStats() {
    return { ...this.navigationStats };
  }

  /**
   * Get current navigation statistics (alias for backward compatibility)
   * @returns {Object} Navigation statistics
   */
  getNavigationStats() {
    return this.getStats();
  }

  /**
   * Enable or disable NavigationGuardian protection
   * @param {boolean} enabled - True to enable, false to disable
   */
  setEnabled(enabled) {
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  /**
   * Reset navigation statistics
   */
  resetStats() {
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    this.updateNavigationStats();
  }

  /**
   * Update whitelist and invalidate cache
   * @param {Array} whitelist - New whitelist array
   */
  updateWhitelist(whitelist) {
    this.whitelist = whitelist;
    this.whitelistCache = null;
  }

  /**
   * Enhanced cleanup with comprehensive resource management
   */
  cleanup() {
    Logger.info(
      "GuardianCleanupStart",
      "Starting NavigationGuardian cleanup..."
    );

    try {
      this.isEnabled = false;
      this._isEventListenersSetup = false;

      // Stop modal cache cleanup timer
      this.stopModalCacheCleanup();

      // Cleanup extracted modules
      if (
        this.modalManager &&
        typeof this.modalManager.cleanup === "function"
      ) {
        this.modalManager.cleanup();
      }

      // SecurityValidator is stateless, no cleanup needed

      // Remove all tracked event listeners
      let removedListeners = 0;
      this.eventListeners.forEach(({ element, type, handler, options }) => {
        try {
          element.removeEventListener(type, handler, options);
          removedListeners++;
        } catch (error) {
          Logger.warn(
            "ListenerRemovalError",
            `Error removing NavigationGuardian ${type} listener`,
            error
          );
        }
      });

      // Clear the listeners array
      this.eventListeners = [];

      // Get final cache stats before cleanup
      const finalCacheStats = this.getModalCacheStats();

      // Clear pending modals
      const pendingModalCount = this.pendingModalKeys.size;
      this.pendingModalKeys.clear();
      this.modalCacheStats.currentPending = 0;

      // Clear cache
      this.whitelistCache = null;

      // Reset stats
      this.navigationStats = { blockedCount: 0, allowedCount: 0 };

      Logger.info(
        "GuardianCleanupComplete",
        "NavigationGuardian cleanup completed",
        {
          removedListeners,
          clearedPendingModals: pendingModalCount,
          finalCacheStats,
        }
      );
    } catch (error) {
      Logger.error(
        "GuardianCleanupError",
        "Error during NavigationGuardian cleanup",
        error
      );
      throw error;
    }
  }

  /**
   * Get comprehensive statistics including cache performance
   * @returns {object} Enhanced statistics
   */
  getEnhancedStats() {
    return {
      navigationStats: this.getStats(),
      modalCache: this.getModalCacheStats(),
      eventListeners: {
        registered: this.eventListeners.length,
        types: [...new Set(this.eventListeners.map((l) => l.type))],
      },
      whitelist: {
        size: this.whitelist.length,
        cacheHit: this.whitelistCache !== null,
      },
      performance: {
        memoryUsage: this.estimateMemoryUsage(),
      },
    };
  }

  /**
   * Estimate memory usage of NavigationGuardian
   * @returns {object} Memory usage estimate
   */
  estimateMemoryUsage() {
    const estimatedBytes = {
      eventListeners: this.eventListeners.length * 100, // rough estimate
      pendingModals: this.pendingModalKeys.size * 200,
      whitelist: this.whitelist.length * 50,
      modules: 1000, // SecurityValidator + ModalManager overhead
      stats: 500, // static overhead
    };

    const total = Object.values(estimatedBytes).reduce(
      (sum, bytes) => sum + bytes,
      0
    );

    return {
      breakdown: estimatedBytes,
      totalBytes: total,
      totalKB: (total / 1024).toFixed(2),
    };
  }

  /**
   * Start modal cache cleanup timer with automatic lifecycle management
   * Uses WeakRef to prevent memory leaks if cleanup is never called
   * Automatically stops timer when extension context becomes invalid
   */
  startModalCacheCleanup() {
    if (this.modalCleanupTimer) {
      Logger.warn("CleanupTimerRunning", "Modal cleanup timer already running");
      return;
    }

    // Use WeakRef to prevent memory leak if cleanup never called
    const guardianRef = new WeakRef(this);

    this.modalCleanupTimer = setInterval(() => {
      const guardian = guardianRef.deref();

      // Auto-cleanup if guardian was garbage collected
      if (!guardian) {
        clearInterval(this.modalCleanupTimer);
        Logger.debug(
          "CleanupTimerAutoStopped",
          "Auto-stopped cleanup timer (guardian garbage collected)"
        );
        return;
      }

      // Auto-cleanup if extension context invalid
      if (!isExtensionContextValid()) {
        guardian.stopModalCacheCleanup();
        Logger.debug(
          "CleanupTimerContextInvalid",
          "Auto-stopped cleanup timer (invalid extension context)"
        );
        return;
      }

      // Normal cleanup
      guardian.cleanupExpiredModals();
    }, 10000); // Check every 10 seconds

    Logger.debug("CleanupTimerStarted", "Started modal cache cleanup timer");
  }

  /**
   * Stop modal cache cleanup timer (idempotent - safe to call multiple times)
   */
  stopModalCacheCleanup() {
    if (this.modalCleanupTimer !== null) {
      clearInterval(this.modalCleanupTimer);
      this.modalCleanupTimer = null;
      Logger.debug("CleanupTimerStopped", "Stopped modal cache cleanup timer");
    }
  }

  /**
   * Clean up expired modals from cache
   */
  cleanupExpiredModals() {
    const now = Date.now();
    let removedCount = 0;

    for (const [messageId, modalInfo] of this.pendingModalKeys) {
      if (now - modalInfo.timestamp > this.modalCacheTimeout) {
        this.pendingModalKeys.delete(messageId);
        removedCount++;
        this.modalCacheStats.currentPending--;
        this.modalCacheStats.totalCleaned++;
      }
    }

    if (removedCount > 0) {
      Logger.debug(
        "ExpiredModalsCleanup",
        `Cleaned up ${removedCount} expired pending modals`,
        { removedCount }
      );
    }
  }

  /**
   * Enforce limits on pending modal cache using LRU eviction with timestamp-based cleanup
   */
  enforcePendingModalLimits() {
    // First, clean up expired modals
    this.cleanupExpiredModals();

    if (this.pendingModalKeys.size > this.maxModalCache) {
      // Convert to array with timestamps and sort by age
      const entries = Array.from(this.pendingModalKeys.entries())
        .map(([key, value]) => ({ key, timestamp: value.timestamp }))
        .sort((a, b) => a.timestamp - b.timestamp);

      const excessCount = this.pendingModalKeys.size - this.maxModalCache;
      const toRemove = entries.slice(0, excessCount);

      for (const { key } of toRemove) {
        this.pendingModalKeys.delete(key);
        this.modalCacheStats.currentPending--;
        this.modalCacheStats.totalCleaned++;
      }

      Logger.debug(
        "CacheLimitEnforced",
        "NavigationGuardian cache limit enforcement",
        { removedEntries: toRemove.length }
      );
    }
  }

  /**
   * Get modal cache statistics
   * @returns {object} Cache statistics
   */
  getModalCacheStats() {
    return {
      ...this.modalCacheStats,
      cacheSize: this.pendingModalKeys.size,
      cacheLimit: this.maxModalCache,
      cacheUtilization:
        ((this.pendingModalKeys.size / this.maxModalCache) * 100).toFixed(1) +
        "%",
      averageModalLifetime: this.calculateAverageModalLifetime(),
      expiredModalsLastCleanup: this.getExpiredModalCount(),
    };
  }

  /**
   * Calculate average lifetime of modals in cache
   * @returns {number} Average lifetime in milliseconds
   */
  calculateAverageModalLifetime() {
    if (this.pendingModalKeys.size === 0) return 0;

    const now = Date.now();
    let totalLifetime = 0;

    for (const modalInfo of this.pendingModalKeys.values()) {
      totalLifetime += now - modalInfo.timestamp;
    }

    return Math.round(totalLifetime / this.pendingModalKeys.size);
  }

  /**
   * Get count of expired modals in cache
   * @returns {number} Number of expired modals
   */
  getExpiredModalCount() {
    const now = Date.now();
    let expiredCount = 0;

    for (const modalInfo of this.pendingModalKeys.values()) {
      if (now - modalInfo.timestamp > this.modalCacheTimeout) {
        expiredCount++;
      }
    }

    return expiredCount;
  }
}
