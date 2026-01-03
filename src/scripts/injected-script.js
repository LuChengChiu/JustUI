// Injected script for Navigation Guardian
// Runs in the page's main world to intercept JavaScript navigation

import { MaliciousPatternDetector } from "./utils/malicious-pattern-detector.js";
import { PermissionCache } from "./utils/permission-cache.js";
import { showBlockedToast } from "./ui/toast-notification.js";
import { safeParseUrl } from "../utils/url-utils.js";
import Logger from "./utils/logger.js";

(function () {
  "use strict";

  // Only inject once per page
  if (window.navigationGuardianInjected) {
    return;
  }
  window.navigationGuardianInjected = true;

  // Configuration constants for optimal performance and maintainability
  const CONFIG = {
    // Permission check timeout (30 seconds to allow user interaction)
    PERMISSION_CHECK_TIMEOUT_MS: 30000,
    // Retry delay between permission check attempts
    RETRY_DELAY_MS: 50,
    // Maximum retry attempts for transient errors
    MAX_PERMISSION_RETRIES: 1,
    // Click window for pop-under detection (1 second)
    CLICK_WINDOW_MS: 1000,
    // Window open tracking window (1 minute)
    WINDOW_OPEN_TRACKING_WINDOW_MS: 60000,
    // Maximum error history size
    MAX_ERROR_HISTORY: 10,
    // Maximum URL length in error logs (prevent memory leaks)
    MAX_URL_LENGTH_IN_LOGS: 200,
    // Pop-under detection threshold score
    POP_UNDER_THRESHOLD_SCORE: 4
  };

  // Statistics tracking
  let blockedScriptsCount = 0;

  // Error statistics tracking for telemetry/debugging
  const errorStats = {
    checkPermissionErrors: 0,
    lastErrors: [],
    errorsByType: {
      'window.open': 0,
      'location.assign': 0,
      'location.replace': 0,
      'location.href': 0
    }
  };

  // ============================================================================
  // Permission Cache System - Fast-Path Decision Layer
  // ============================================================================

  // In-memory permission cache instance (initialized synchronously, hydrated from storage)
  // ✅ FIX: Initialize immediately with empty cache to prevent race condition
  let inMemoryPermissionCache = new PermissionCache();

  // Background hydration from chrome.storage (non-blocking)
  // Populates cache with persisted decisions without blocking initial navigations
  (async function hydrateCacheFromStorage() {
    try {
      await inMemoryPermissionCache.syncFromStorage();
      const stats = inMemoryPermissionCache.getStats();
      Logger.info('CacheHydrated', 'Navigation Guardian cache hydrated', {
        cacheSize: stats.cacheSize,
        hitRate: stats.hitRate
      });
    } catch (error) {
      Logger.warn('CacheHydrationFailed', 'Cache hydration failed, starting with empty cache', error);
      // Continue with empty cache - still functional
    }
  })();

  /**
   * Fast synchronous decision layer for navigation attempts
   * Target: <3ms average decision time
   *
   * @param {string} url - Target navigation URL
   * @param {string} navType - Navigation type ('window.open', 'location.assign', etc.)
   * @param {string} name - Window name (for window.open only)
   * @param {string} features - Window features (for window.open only)
   * @returns {Object} Decision object: { decision: 'ALLOW'|'BLOCK'|'NEEDS_MODAL', reason, metadata }
   */
  function quickNavigationDecision(url, navType, name, features, parsedUrl = null) {
    // 1. Same-origin → ALLOW immediately (0ms check)
    if (!url || /^(javascript|mailto|tel|data|blob|about):|^#/.test(url)) {
      return { decision: 'ALLOW', reason: 'same-origin' };
    }

    const urlObj = parsedUrl || safeParseUrl(url, window.location.href, {
      context: "Navigation decision",
      level: "silent",
      prefix: "Navigation Guardian"
    });
    if (!urlObj) {
      return { decision: 'ALLOW', reason: 'same-origin' };
    }

    if (!isCrossOrigin(url, urlObj)) {
      return { decision: 'ALLOW', reason: 'same-origin' };
    }

    // 2. Check permission cache (1ms lookup)
    // ✅ FIX: No optional chaining needed - cache always initialized
    const sourceOrigin = window.location.origin;
    try {
      const targetOrigin = urlObj.origin;
      const cached = inMemoryPermissionCache.getSync(sourceOrigin, targetOrigin);
      if (cached && !cached.isExpired) {
        return {
          decision: cached.decision === 'ALLOW' ? 'ALLOW' : 'BLOCK',
          reason: 'cached-permission',
          metadata: cached.metadata
        };
      }
    } catch (e) {
      // Invalid URL - continue to other checks
    }

    // 3. Pop-under detection (2ms) - only for window.open
    if (navType === 'window.open') {
      const analysis = isPopUnderBehavior(url, name, features);
      if (analysis.isPopUnder) {
        return {
          decision: 'BLOCK',
          reason: 'pop-under',
          metadata: analysis
        };
      }
    }

    // 4. Malicious URL patterns (2ms)
    if (MaliciousPatternDetector.isUrlMalicious(url || '')) {
      return { decision: 'BLOCK', reason: 'malicious-pattern' };
    }

    // 5. Risk-based for location.* methods (location.href less risky than window.open)
    if (navType.startsWith('location.')) {
      const riskLevel = assessLocationRisk(url, urlObj);
      if (riskLevel === 'LOW') {
        return { decision: 'ALLOW', reason: 'low-risk-spa-navigation' };
      }
      if (riskLevel === 'HIGH') {
        return { decision: 'BLOCK', reason: 'high-risk-navigation' };
      }
    }

    // 6. Uncertain → needs modal
    return { decision: 'NEEDS_MODAL', reason: 'cross-origin-unknown' };
  }

  /**
   * Risk assessment for location.* navigation methods
   * Helps distinguish legitimate SPA navigation from malicious redirects
   *
   * @param {string} url - Target navigation URL
   * @param {URL|null} urlObj - Parsed URL, if already available
   * @returns {string} Risk level: 'LOW', 'MEDIUM', or 'HIGH'
   */
  function assessLocationRisk(url, urlObj = null) {
    try {
      if (!urlObj) {
        urlObj = new URL(url, window.location.href);
      }

      // HIGH risk indicators
      if (MaliciousPatternDetector.isUrlMalicious(url)) {
        return 'HIGH'; // Matches ad networks, tracking params, etc.
      }
      if (/^(data|blob|javascript):/.test(urlObj.protocol)) {
        return 'HIGH'; // Dangerous protocols
      }

      // LOW risk indicators (common SPA patterns and trusted domains)
      const trustedTLDs = ['.gov', '.edu', '.org'];
      if (trustedTLDs.some(tld => urlObj.hostname.endsWith(tld))) {
        return 'LOW'; // Government, education, organization sites
      }

      // Check if URL looks like OAuth/SSO callback (common SPA pattern)
      const oauthPatterns = [
        /oauth/i,
        /callback/i,
        /auth/i,
        /login/i,
        /sso/i
      ];
      if (oauthPatterns.some(pattern => pattern.test(urlObj.pathname))) {
        return 'LOW'; // Likely legitimate authentication flow
      }

      // MEDIUM risk (default - show modal for confirmation)
      return 'MEDIUM';
    } catch (e) {
      // Invalid URL = high risk
      return 'HIGH';
    }
  }

  // Listen for cache updates from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'NAV_CACHE_UPDATE') {
      const { sourceOrigin, targetOrigin, decision, persistent } = event.data;

      // Cache always exists (initialized synchronously above)
      inMemoryPermissionCache.setSync(
        sourceOrigin,
        targetOrigin,
        decision,
        { persist: persistent }
      );

      // Debounced sync to chrome.storage happens automatically
      Logger.debug('PermissionCached', 'Permission decision cached', () => ({
        decision,
        targetOrigin,
        persistent
      }));
    }
  });

  // Report stats to content script via postMessage
  function reportStats() {
    window.postMessage(
      {
        type: "NAV_GUARDIAN_STATS",
        stats: {
          blockedScripts: blockedScriptsCount,
        },
      },
      "*"
    );
  }

  // Report permission check errors for debugging/telemetry
  function reportPermissionError(error, url, navType, isHighRisk) {
    errorStats.checkPermissionErrors++;
    errorStats.errorsByType[navType]++;

    // Truncate URL to prevent memory leaks from massive URLs
    const truncatedUrl = url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS) || '';
    const urlWasTruncated = url && url.length > CONFIG.MAX_URL_LENGTH_IN_LOGS;

    // Keep last N errors for debugging (configurable via CONFIG.MAX_ERROR_HISTORY)
    errorStats.lastErrors.push({
      timestamp: Date.now(),
      error: error?.message || String(error),
      url: truncatedUrl + (urlWasTruncated ? '...' : ''),
      navType: navType,
      isHighRisk: isHighRisk
    });

    if (errorStats.lastErrors.length > CONFIG.MAX_ERROR_HISTORY) {
      errorStats.lastErrors.shift();
    }

    // Report to content script for analytics (use window.location.origin for security)
    window.postMessage(
      {
        type: "NAV_GUARDIAN_ERROR",
        error: {
          message: error?.message || String(error),
          url: truncatedUrl + (urlWasTruncated ? '...' : ''),
          navType: navType,
          isHighRisk: isHighRisk
        },
        stats: errorStats
      },
      window.location.origin
    );

    Logger.error('PermissionCheckError', 'Permission check failed', error, {
      navType,
      url: truncatedUrl + (urlWasTruncated ? '... [truncated]' : ''),
      isHighRisk,
      totalErrors: errorStats.checkPermissionErrors
    });
  }

  // Feature detection and safe override utilities
  function canOverrideProperty(obj, propName) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, propName);
      if (descriptor) {
        return (
          descriptor.writable !== false && descriptor.configurable !== false
        );
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeOverride(obj, propName, newValue, context = "property") {
    // Pre-check if property can be overridden
    if (!canOverrideProperty(obj, propName)) {
      Logger.debug('SkipOverride', `Skipping ${context} - not writable/configurable`, {
        context,
        propName
      });
      return false;
    }

    try {
      const originalValue = obj[propName];
      obj[propName] = newValue;

      Logger.debug('OverrideSuccess', `Successfully overrode ${context}`, {
        context,
        propName
      });
      return true;
    } catch (e) {
      Logger.warn('OverrideFailed', `Cannot override ${context}`, {
        context,
        propName,
        error: e.message
      });
      return false;
    }
  }

  // Safe property definition for complex cases
  function safeDefineProperty(obj, propName, descriptor, context = "property") {
    // Pre-check if property exists and is configurable
    try {
      const existingDescriptor = Object.getOwnPropertyDescriptor(obj, propName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        Logger.debug('SkipDefine', `Skipping ${context} - not configurable`, {
          context,
          propName
        });
        return false;
      }
    } catch (e) {
      Logger.warn('DescriptorCheckFailed', `Cannot check descriptor for ${context}`, {
        context,
        propName,
        error: e.message
      });
      return false;
    }

    try {
      Object.defineProperty(obj, propName, descriptor);
      Logger.debug('DefineSuccess', `Successfully defined ${context}`, {
        context,
        propName
      });
      return true;
    } catch (e) {
      Logger.warn('DefineFailed', `Cannot define ${context}`, {
        context,
        propName,
        error: e.message
      });
      return false;
    }
  }

  // Save original functions before overriding (with safety checks)
  const originalWindowOpen = window.open;
  let originalLocationAssign = null;
  let originalLocationReplace = null;
  let originalHrefDescriptor = null;

  // Safely capture original methods
  try {
    originalLocationAssign = window.location.assign;
  } catch (e) {
    Logger.warn('AccessFailed', 'Cannot access location.assign', { error: e.message });
  }

  try {
    originalLocationReplace = window.location.replace;
  } catch (e) {
    Logger.warn('AccessFailed', 'Cannot access location.replace', { error: e.message });
  }

  try {
    originalHrefDescriptor =
      Object.getOwnPropertyDescriptor(Location.prototype, "href") ||
      Object.getOwnPropertyDescriptor(window.location, "href");
  } catch (e) {
    Logger.warn('AccessFailed', 'Cannot access href descriptor', { error: e.message });
  }

  // Utility function to check if URL is cross-origin
  function isCrossOrigin(url, urlObj = null) {
    if (!url) return false;

    // Ignore special protocols
    if (/^(javascript|mailto|tel|data|blob|about):|^#/.test(url)) {
      return false;
    }

    try {
      const targetUrl = urlObj || new URL(url, window.location.href);
      // Use origin comparison instead of hostname to catch:
      // - Different protocols (http vs https)
      // - Different ports (example.com:8080 vs example.com:3000)
      // - Different subdomains (api.example.com vs www.example.com)
      return targetUrl.origin !== window.location.origin;
    } catch (error) {
      return false;
    }
  }

  // Generate unique message ID for communication
  function generateMessageId() {
    return (
      "nav-guard-" +
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 9)
    );
  }

  // Send message to content script and wait for response
  function checkNavigationPermission(url, signal) {
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      let hasResolved = false;
      let abortHandler = null;

      // Cleanup helper to prevent memory leaks
      const cleanup = () => {
        try {
          window.removeEventListener("message", handleResponse);
        } catch (e) {
          // Ignore cleanup errors
        }
        if (abortHandler && signal) {
          try {
            signal.removeEventListener("abort", abortHandler);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      };

      // Handle abort signal (timeout or external cancel)
      if (signal) {
        if (signal.aborted) {
          hasResolved = true;
          cleanup();
          resolve(false);
          return;
        }

        abortHandler = () => {
          if (!hasResolved) {
            hasResolved = true;
            cleanup();
            Logger.warn(
              'PermissionTimeout',
              'Permission check timed out',
              { url: url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS) }
            );
            resolve(false);
          }
        };

        try {
          signal.addEventListener("abort", abortHandler, { once: true });
        } catch (error) {
          hasResolved = true;
          cleanup();
          reject(new Error(`Failed to add abort listener: ${error.message}`));
          return;
        }
      }

      // Listen for response
      function handleResponse(event) {
        try {
          if (event.source !== window || hasResolved) return;

          if (
            event.data?.type === "NAV_GUARDIAN_RESPONSE" &&
            event.data?.messageId === messageId
          ) {
            hasResolved = true;
            cleanup();

            const allowed = event.data.allowed || false;
            Logger.debug(
              'PermissionResponse',
              `Permission ${allowed ? 'granted' : 'denied'}`,
              { url: url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS), allowed }
            );
            resolve(allowed);
          }
        } catch (error) {
          // Error in message handler - reject the promise
          if (!hasResolved) {
            hasResolved = true;
            cleanup();
            reject(new Error(`Message handler error: ${error.message}`));
          }
        }
      }

      // Register message listener with error handling
      try {
        window.addEventListener("message", handleResponse);
      } catch (error) {
        hasResolved = true;
        cleanup();
        reject(new Error(`Failed to add message listener: ${error.message}`));
        return;
      }

      // Send request to content script with pop-under analysis
      try {
        Logger.debug(
          'PermissionRequest',
          'Requesting permission for navigation',
          { url: url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS) }
        );
        window.postMessage(
          {
            type: "NAV_GUARDIAN_CHECK",
            url: url,
            messageId: messageId,
            popUnderAnalysis: {
              isPopUnder: true, // This function is only called for suspected pop-unders
              score: 7, // Base score for detected pop-under attempt
              threats: [
                {
                  type: "Window.open() pop-under attempt detected",
                  score: 7,
                },
              ],
            },
          },
          window.location.origin
        );
      } catch (error) {
        // Error sending message - reject the promise
        hasResolved = true;
        cleanup();
        reject(new Error(`Failed to send permission request: ${error.message}`));
      }
    });
  }

  // Enhanced permission check with retry logic and context-aware error handling
  async function safeCheckNavigationPermission(url, navType, signal) {
    const truncatedUrl = url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS) || '';
    let controller = null;
    let timeoutId = null;
    const activeSignal = signal || (() => {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), CONFIG.PERMISSION_CHECK_TIMEOUT_MS);
      return controller.signal;
    })();

    try {
      for (let attempt = 0; attempt <= CONFIG.MAX_PERMISSION_RETRIES; attempt++) {
        try {
          return await checkNavigationPermission(url, activeSignal);
        } catch (error) {
          // Log error with URL context for debugging
          Logger.warn(
            'PermissionCheckRetry',
            `${navType} check failed (attempt ${attempt + 1}/${CONFIG.MAX_PERMISSION_RETRIES + 1})`,
            error,
            { url: truncatedUrl, navType }
          );

          // Last attempt failed - decide based on risk level
          if (attempt === CONFIG.MAX_PERMISSION_RETRIES) {
            // Assess risk level for context-aware fallback
            const isHighRisk = assessNavigationRisk(navType, url);

            // Report error for telemetry
            reportPermissionError(error, url, navType, isHighRisk);

            // Return safe default based on risk:
            // - High risk (window.open, malicious URLs) -> deny (false)
            // - Low risk (location.href, safe URLs) -> allow (true)
            const shouldAllowOnError = !isHighRisk;

            Logger.warn(
              'PermissionFallback',
              `Using ${isHighRisk ? 'DENY' : 'ALLOW'} fallback for ${navType}`,
              { url: truncatedUrl, risk: isHighRisk ? 'HIGH' : 'LOW', decision: shouldAllowOnError }
            );

            return shouldAllowOnError;
          }

          // Brief delay before retry to allow transient errors to resolve
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
        }
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (controller) {
        controller.abort();
      }
    }

    // Should never reach here, but fail-secure just in case
    return false;
  }

  // Assess navigation risk level for context-aware error handling
  function assessNavigationRisk(navType, url) {
    // window.open is high risk (often used for pop-ups/ads)
    if (navType === 'window.open') {
      return true; // HIGH RISK
    }

    // Check if URL matches malicious patterns
    try {
      if (MaliciousPatternDetector.isUrlMalicious(url || '')) {
        return true; // HIGH RISK - malicious URL pattern detected
      }
    } catch (error) {
      Logger.warn('MaliciousCheckError', 'Error checking URL maliciousness', error, { url: url?.substring(0, 200) });
      // If malicious check fails, assume low-medium risk for location methods
      // window.open would have already returned true above
      return false;
    }

    // location.href, location.assign, location.replace are LOW-MEDIUM risk
    // These are standard navigation methods used by legitimate SPAs (React Router, Vue Router, etc.)
    // Only deny on error if URL is actually malicious (checked above)
    return false; // LOW-MEDIUM RISK (allow on error for better UX)
  }

  // Track which overrides were successful
  const overrideStatus = {
    windowOpen: false,
    locationAssign: false,
    locationReplace: false,
    locationHref: false,
  };

  // Pop-under detection now uses MaliciousPatternDetector module

  // Track window.open() call patterns for pop-under detection
  let recentWindowOpens = [];
  let lastDocumentClick = 0;

  // Store original EventTarget methods to prevent malicious override
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  // Listen for document clicks to detect pop-under triggers
  document.addEventListener(
    "click",
    () => {
      lastDocumentClick = Date.now();
    },
    true
  );

  // Override addEventListener to intercept and block malicious click listeners
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    // Block deprecated 'unload' event - violates Permissions Policy in modern Chrome
    // See: https://developer.chrome.com/blog/deprecating-unload
    if (type === "unload") {
      Logger.info(
        'UnloadEventBlocked',
        'Blocked deprecated "unload" event listener',
        { suggestion: 'Use "pagehide" with { capture: true } instead' }
      );
      // Silently ignore - don't throw, just don't register
      return;
    }

    // Check if this is a suspicious click listener
    if (type === "click" && typeof listener === "function") {
      const listenerStr = listener.toString();

      // Use MaliciousPatternDetector for pattern analysis
      const analysis = MaliciousPatternDetector.analyze(listenerStr, 6);

      if (analysis.isMalicious) {
        Logger.security(
          'MaliciousListenerBlocked',
          'Blocked malicious click listener',
          {
            target: this.tagName || this.constructor.name,
            riskScore: analysis.riskScore,
            threats: analysis.threats,
            listenerPreview: listenerStr.substring(0, 200) + '...',
            options: options,
          }
        );

        return;
      }
    }

    // Call original addEventListener for legitimate listeners
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Clean up existing malicious listeners on the document
  function cleanupMaliciousListeners() {
    try {
      // We can't directly enumerate existing listeners, but we can replace common targets
      const scriptElements = document.querySelectorAll("script");
      let localBlockedCount = 0;

      scriptElements.forEach((script) => {
        const content = script.textContent || script.innerHTML || "";

        if (!content) return;

        // Use MaliciousPatternDetector with higher threshold for cleanup
        const analysis = MaliciousPatternDetector.analyze(content, 7);

        if (analysis.isMalicious) {
          Logger.security(
            'MaliciousScriptRemoved',
            'Removing malicious script',
            {
              riskScore: analysis.riskScore,
              threats: analysis.threats,
              contentPreview: content.substring(0, 100) + '...',
            }
          );
          script.remove();
          localBlockedCount++;
          blockedScriptsCount++; // Update global counter
        }
      });

      if (localBlockedCount > 0 || blockedScriptsCount > 0) {
        reportStats();
      }
    } catch (error) {
      Logger.warn(
        'CleanupError',
        'Error cleaning up malicious listeners',
        error
      );
    }
  }

  // Run cleanup immediately
  cleanupMaliciousListeners();

  // Report initial stats after cleanup
  // reportStats();

  function isPopUnderBehavior(url, name, features) {
    const now = Date.now();

    // Check if this window.open() is triggered within click window
    const isClickTriggered = now - lastDocumentClick < CONFIG.CLICK_WINDOW_MS;

    // Check for pop-under URL patterns using MaliciousPatternDetector
    const hasPopUnderURL = MaliciousPatternDetector.isUrlMalicious(url || '');

    // Check for _blank target with immediate focus (pop-under characteristic)
    const isBlankTarget = name === '_blank' || name === '';

    // Track recent window.open() calls to detect rate limiting behavior
    recentWindowOpens.push(now);
    recentWindowOpens = recentWindowOpens.filter(
      (time) => now - time < CONFIG.WINDOW_OPEN_TRACKING_WINDOW_MS
    );

    const tooFrequent = recentWindowOpens.length > 3; // More than 3 opens per tracking window

    // Combine factors to determine pop-under likelihood
    const popUnderScore =
      (isClickTriggered ? 3 : 0) +
      (hasPopUnderURL ? 4 : 0) +
      (isBlankTarget ? 2 : 0) +
      (tooFrequent ? 2 : 0);

    return {
      isPopUnder: popUnderScore >= CONFIG.POP_UNDER_THRESHOLD_SCORE,
      score: popUnderScore,
      factors: {
        clickTriggered: isClickTriggered,
        popUnderURL: hasPopUnderURL,
        blankTarget: isBlankTarget,
        tooFrequent: tooFrequent,
      },
    };
  }

  // ============================================================================
  // Pending Window Proxy - Solves OAuth/Payment/Pop-up Window Reference Issues
  // ============================================================================
  const activeProxyRegistry = new Set();

  const cleanupPendingProxies = (reason) => {
    for (const proxy of Array.from(activeProxyRegistry)) {
      if (proxy && !proxy.resolved) {
        proxy.finalize(false, reason);
      }
    }
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', () => cleanupPendingProxies('pagehide'), { capture: true });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        cleanupPendingProxies('visibilitychange');
      }
    }, { capture: true });
  }

  if (window.__NAV_GUARDIAN_DEBUG__ && typeof window.__NAV_GUARDIAN_DEBUG__ === 'object') {
    if (!Object.prototype.hasOwnProperty.call(window.__NAV_GUARDIAN_DEBUG__, 'getPendingCount')) {
      Object.defineProperty(window.__NAV_GUARDIAN_DEBUG__, 'getPendingCount', {
        value: () => activeProxyRegistry.size,
        enumerable: false
      });
    }
  }

  /**
   * Pending Window Proxy Class
   *
   * Returns a Proxy object immediately (not null) that queues operations
   * until async permission check resolves. Solves the fundamental problem:
   * - window.open() must return synchronously
   * - Permission check requires async user interaction
   *
   * Fixes: OAuth flows, payment gateways, legitimate pop-ups
   */
  class PendingWindowProxy {
    constructor(url, name, features) {
      this.url = url;
      this.name = name;
      this.features = features;
      this.realWindow = null;
      this.pendingOps = [];
      this.resolved = false;
      this.allowed = false;
      this.abortController = new AbortController();
      this.abortTimer = setTimeout(() => {
        this.abortController.abort();
      }, CONFIG.PERMISSION_CHECK_TIMEOUT_MS);
      this.abortHandler = () => this.finalize(false, 'timeout');

      try {
        this.abortController.signal.addEventListener('abort', this.abortHandler, { once: true });
      } catch (e) {
        Logger.warn('ProxyAbortListenerError', 'Failed to add abort listener', e);
      }

      activeProxyRegistry.add(this);

      // Start async permission check in background
      this.permissionPromise = this.checkPermission();
    }

    async checkPermission() {
      try {
        const allowed = await safeCheckNavigationPermission(this.url, 'window.open', this.abortController.signal);
        if (this.resolved) {
          return;
        }
        this.finalize(allowed, allowed ? 'allowed' : 'denied');
      } catch (error) {
        Logger.error('ProxyPermissionError', 'Permission check failed', error, { url: this.url?.substring(0, 200) });
        this.finalize(false, 'error');
      }
    }

    finalize(allowed, reason) {
      if (this.resolved) {
        return;
      }

      this.resolved = true;
      this.allowed = allowed;

      if (this.abortTimer) {
        clearTimeout(this.abortTimer);
        this.abortTimer = null;
      }

      if (this.abortController?.signal && this.abortHandler) {
        try {
          this.abortController.signal.removeEventListener('abort', this.abortHandler);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      if (allowed) {
        this.realWindow = originalWindowOpen.call(window, this.url, this.name, this.features);
        if (this.realWindow) {
          this.replayQueuedOps();
        } else {
          Logger.warn('ProxyWindowOpenFailed', 'Failed to open real window (popup blocked?)');
        }
      } else if (reason === 'timeout') {
        Logger.warn('ProxyTimeout', 'Permission check timed out');
      } else if (reason === 'denied') {
        Logger.debug('ProxyDenied', 'Navigation denied by user');
      }

      this.pendingOps = [];
      this.permissionPromise = null;
      activeProxyRegistry.delete(this);
    }

    replayQueuedOps() {
      if (!this.realWindow) {
        Logger.warn('ProxyReplayError', 'Cannot replay ops - no real window');
        return;
      }

      Logger.debug('ProxyReplay', `Replaying queued operations`, { count: this.pendingOps.length });

      for (const op of this.pendingOps) {
        try {
          op(this.realWindow);
        } catch (e) {
          Logger.warn('ProxyReplayOpError', 'Failed to replay operation', e);
        }
      }

      this.pendingOps = [];
    }

    createProxy() {
      const self = this;

      return new Proxy(this, {
        get(target, prop) {
          if (target.resolved && !target.realWindow) {
            if (prop === 'closed') {
              return true;
            }
            return undefined;
          }
          // Handle common property checks
          if (prop === 'closed') {
            if (!target.resolved) return false; // Pending = not closed
            return target.realWindow?.closed ?? true;
          }

          if (prop === 'location') {
            return target.realWindow?.location ?? null;
          }

          if (prop === 'document') {
            return target.realWindow?.document ?? null;
          }

          if (prop === 'opener') {
            return target.realWindow?.opener ?? window;
          }

          if (prop === 'name') {
            return target.realWindow?.name ?? target.name;
          }

          // Method calls - queue if not resolved
          if (typeof window[prop] === 'function' || !target.resolved) {
            return (...args) => {
              if (target.resolved && target.realWindow) {
                // Forward to real window
                try {
                  return target.realWindow[prop]?.(...args);
                } catch (e) {
                  Logger.warn('ProxyCallError', `Failed to call ${String(prop)}`, e);
                  return undefined;
                }
              } else if (!target.resolved) {
                // Queue operation for later replay
                target.pendingOps.push(win => {
                  if (win && typeof win[prop] === 'function') {
                    try {
                      win[prop](...args);
                    } catch (e) {
                      Logger.warn('ProxyReplayMethodError', `Failed to replay ${String(prop)}`, e);
                    }
                  }
                });
                return undefined;
              }
            };
          }

          // Forward property access
          return target.realWindow?.[prop];
        },

        set(target, prop, value) {
          if (target.resolved && !target.realWindow) {
            return true;
          }
          if (!target.resolved) {
            // Queue property set
            target.pendingOps.push(win => {
              if (win) {
                try {
                  win[prop] = value;
                } catch (e) {
                  Logger.warn('ProxySetError', `Failed to set ${String(prop)}`, e);
                }
              }
            });
            return true;
          }

          if (target.realWindow) {
            try {
              target.realWindow[prop] = value;
            } catch (e) {
              Logger.warn('ProxySetError', `Failed to set ${String(prop)}`, e);
            }
          }
          return true;
        }
      });
    }
  }

  // Enhanced window.open override with fast-path + proxy pattern
  overrideStatus.windowOpen = safeOverride(
    window,
    "open",
    function (url, name, features) {
      // Fast-path decision layer (<3ms average)
      const parsedUrl = safeParseUrl(url, window.location.href, {
        context: "Navigation decision",
        level: "silent",
        prefix: "Navigation Guardian"
      });
      const decision = quickNavigationDecision(url, 'window.open', name, features, parsedUrl);

      if (decision.decision === 'ALLOW') {
        // ✅ Allowed - return real window immediately
        Logger.debug('WindowOpenAllowed', 'Allowing window.open', {
          reason: decision.reason,
          url: url?.substring(0, 200)
        });
        return originalWindowOpen.call(this, url, name, features);
      }

      if (decision.decision === 'BLOCK') {
        // ❌ Blocked - return null immediately
        Logger.security('WindowOpenBlocked', 'Blocked window.open', {
          reason: decision.reason,
          url: url?.substring(0, 200),
          ...decision.metadata
        });
        return null;
      }

      // 🔄 NEEDS_MODAL - Return proxy that resolves async
      Logger.debug('WindowOpenPending', 'Creating pending proxy for window.open', {
        reason: decision.reason,
        url: url?.substring(0, 200)
      });
      const proxy = new PendingWindowProxy(url, name, features);
      return proxy.createProxy();
    },
    "method"
  );


  // Override location.assign with fast-path + risk-based strategy
  if (originalLocationAssign) {
    overrideStatus.locationAssign = safeOverride(
      window.location,
      "assign",
      function (url) {
        const parsedUrl = safeParseUrl(url, window.location.href, {
          context: "Navigation decision",
          level: "silent",
          prefix: "Navigation Guardian"
        });
        // Fast-path decision layer
        const decision = quickNavigationDecision(url, 'location.assign', null, null, parsedUrl);

        if (decision.decision === 'ALLOW') {
          // ✅ Allowed - navigate immediately
          Logger.debug('LocationAssignAllowed', 'Allowing location.assign', {
            reason: decision.reason,
            url: url?.substring(0, 200)
          });
          return originalLocationAssign.call(this, url);
        }

        if (decision.decision === 'BLOCK') {
          // ❌ Blocked - prevent navigation + show toast
          Logger.security('LocationAssignBlocked', 'Blocked location.assign', {
            reason: decision.reason,
            url: url?.substring(0, 200)
          });
          showBlockedToast(url, decision.reason);
          return; // Prevent navigation
        }

        // 🔄 NEEDS_MODAL - Check permission async (current behavior preserved)
        safeCheckNavigationPermission(url, 'location.assign')
          .then((allowed) => {
            if (allowed) {
              originalLocationAssign.call(window.location, url);

              // Cache decision for future navigations
              const sourceOrigin = window.location.origin;
              const targetOrigin = parsedUrl?.origin;
              if (targetOrigin) {
                inMemoryPermissionCache?.setSync(sourceOrigin, targetOrigin, 'ALLOW', { persist: false });
              }
            }
          })
          .catch((error) => {
            Logger.error('LocationAssignError', 'Unexpected error in location.assign', error, {
              url: url?.substring(0, 200)
            });
            reportPermissionError(error, url, 'location.assign', true);
            // Fail-secure: deny navigation
            try {
              showBlockedToast(url, 'Navigation blocked due to security check error');
            } catch (toastError) {
              Logger.warn('ToastFailed', 'Could not show blocked toast', toastError);
            }
          });
      },
      "method"
    );
  }

  // Override location.replace with fast-path + risk-based strategy
  if (originalLocationReplace) {
    overrideStatus.locationReplace = safeOverride(
      window.location,
      "replace",
      function (url) {
        const parsedUrl = safeParseUrl(url, window.location.href, {
          context: "Navigation decision",
          level: "silent",
          prefix: "Navigation Guardian"
        });
        // Fast-path decision layer
        const decision = quickNavigationDecision(url, 'location.replace', null, null, parsedUrl);

        if (decision.decision === 'ALLOW') {
          // ✅ Allowed - navigate immediately
          Logger.debug('LocationReplaceAllowed', 'Allowing location.replace', {
            reason: decision.reason,
            url: url?.substring(0, 200)
          });
          return originalLocationReplace.call(this, url);
        }

        if (decision.decision === 'BLOCK') {
          // ❌ Blocked - prevent navigation + show toast
          Logger.security('LocationReplaceBlocked', 'Blocked location.replace', {
            reason: decision.reason,
            url: url?.substring(0, 200)
          });
          showBlockedToast(url, decision.reason);
          return; // Prevent navigation
        }

        // 🔄 NEEDS_MODAL - Check permission async (current behavior preserved)
        safeCheckNavigationPermission(url, 'location.replace')
          .then((allowed) => {
            if (allowed) {
              originalLocationReplace.call(window.location, url);

              // Cache decision for future navigations
              const sourceOrigin = window.location.origin;
              const targetOrigin = parsedUrl?.origin;
              if (targetOrigin) {
                inMemoryPermissionCache?.setSync(sourceOrigin, targetOrigin, 'ALLOW', { persist: false });
              }
            }
          })
          .catch((error) => {
            Logger.error('LocationReplaceError', 'Unexpected error in location.replace', error, {
              url: url?.substring(0, 200)
            });
            reportPermissionError(error, url, 'location.replace', true);
            // Fail-secure: deny navigation
            try {
              showBlockedToast(url, 'Navigation blocked due to security check error');
            } catch (toastError) {
              Logger.warn('ToastFailed', 'Could not show blocked toast', toastError);
            }
          });
      },
      "method"
    );
  }

  // Override location.href setter with fast-path + risk-based strategy
  if (originalHrefDescriptor && originalHrefDescriptor.set) {
    overrideStatus.locationHref = safeDefineProperty(
      window.location,
      "href",
      {
        get: originalHrefDescriptor.get,
        set: function (url) {
          const parsedUrl = safeParseUrl(url, window.location.href, {
            context: "Navigation decision",
            level: "silent",
            prefix: "Navigation Guardian"
          });
          // Fast-path decision layer
          const decision = quickNavigationDecision(url, 'location.href', null, null, parsedUrl);

          if (decision.decision === 'ALLOW') {
            // ✅ Allowed - navigate immediately
            Logger.debug('LocationHrefAllowed', 'Allowing location.href assignment', {
              reason: decision.reason,
              url: url?.substring(0, 200)
            });
            return originalHrefDescriptor.set.call(this, url);
          }

          if (decision.decision === 'BLOCK') {
            // ❌ Blocked - prevent navigation + show toast
            Logger.security('LocationHrefBlocked', 'Blocked location.href assignment', {
              reason: decision.reason,
              url: url?.substring(0, 200)
            });
            showBlockedToast(url, decision.reason);
            return; // Prevent navigation
          }

          // 🔄 NEEDS_MODAL - Check permission async (current behavior preserved)
          safeCheckNavigationPermission(url, 'location.href')
            .then((allowed) => {
              if (allowed) {
                originalHrefDescriptor.set.call(window.location, url);

                // Cache decision for future navigations
                const sourceOrigin = window.location.origin;
                const targetOrigin = parsedUrl?.origin;
                if (targetOrigin) {
                  inMemoryPermissionCache?.setSync(sourceOrigin, targetOrigin, 'ALLOW', { persist: false });
                }
              }
            })
            .catch((error) => {
              Logger.error('LocationHrefError', 'Unexpected error in location.href', error, {
                url: url?.substring(0, 200)
              });
              reportPermissionError(error, url, 'location.href', true);
              // Fail-secure: deny navigation (consistent with location.assign/replace)
              try {
                showBlockedToast(url, 'Navigation blocked due to security check error');
              } catch (toastError) {
                Logger.warn('ToastFailed', 'Could not show blocked toast', toastError);
              }
            });
        },
        enumerable: originalHrefDescriptor.enumerable,
        configurable: originalHrefDescriptor.configurable,
      },
      "property"
    );
  }

  // Log what was successfully overridden
  const successfulOverrides = Object.entries(overrideStatus)
    .filter(([_, success]) => success)
    .map(([name, _]) => name);

  const failedOverrides = Object.entries(overrideStatus)
    .filter(([_, success]) => !success)
    .map(([name, _]) => name);

  Logger.info(
    'OverrideStatus',
    'JavaScript overrides initialization complete',
    {
      successful: successfulOverrides,
      failed: failedOverrides,
      note:
        failedOverrides.length > 0
          ? 'Some overrides failed - relying on DOM interception'
          : 'All overrides successful',
    }
  );
})();
