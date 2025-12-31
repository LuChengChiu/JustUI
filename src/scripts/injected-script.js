// Injected script for Navigation Guardian
// Runs in the page's main world to intercept JavaScript navigation

import { MaliciousPatternDetector } from "./utils/malicious-pattern-detector.js";

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

    console.error('Navigation Guardian: Permission error details:', {
      navType: navType,
      url: truncatedUrl + (urlWasTruncated ? '... [truncated]' : ''),
      isHighRisk: isHighRisk,
      totalErrors: errorStats.checkPermissionErrors,
      errorMessage: error?.message || String(error)
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
      console.info(
        `Navigation Guardian: Skipping ${context} ${propName} - not writable/configurable`
      );
      return false;
    }

    try {
      const originalValue = obj[propName];
      obj[propName] = newValue;

      console.log(
        `Navigation Guardian: Successfully overrode ${context} ${propName}`
      );
      return true;
    } catch (e) {
      console.warn(
        `Navigation Guardian: Cannot override ${context} ${propName}:`,
        e.message
      );
      return false;
    }
  }

  // Safe property definition for complex cases
  function safeDefineProperty(obj, propName, descriptor, context = "property") {
    // Pre-check if property exists and is configurable
    try {
      const existingDescriptor = Object.getOwnPropertyDescriptor(obj, propName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        console.info(
          `Navigation Guardian: Skipping ${context} ${propName} - not configurable`
        );
        return false;
      }
    } catch (e) {
      console.warn(
        `Navigation Guardian: Cannot check descriptor for ${context} ${propName}`
      );
      return false;
    }

    try {
      Object.defineProperty(obj, propName, descriptor);
      console.log(
        `Navigation Guardian: Successfully defined ${context} ${propName}`
      );
      return true;
    } catch (e) {
      console.warn(
        `Navigation Guardian: Cannot define ${context} ${propName}:`,
        e.message
      );
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
    console.warn("Navigation Guardian: Cannot access location.assign");
  }

  try {
    originalLocationReplace = window.location.replace;
  } catch (e) {
    console.warn("Navigation Guardian: Cannot access location.replace");
  }

  try {
    originalHrefDescriptor =
      Object.getOwnPropertyDescriptor(Location.prototype, "href") ||
      Object.getOwnPropertyDescriptor(window.location, "href");
  } catch (e) {
    console.warn("Navigation Guardian: Cannot access href descriptor");
  }

  // Utility function to check if URL is cross-origin
  function isCrossOrigin(url) {
    if (!url) return false;

    // Ignore special protocols
    if (/^(javascript|mailto|tel|data|blob|about):|^#/.test(url)) {
      return false;
    }

    try {
      const targetUrl = new URL(url, window.location.href);
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
  function checkNavigationPermission(url) {
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      let hasResolved = false;

      // Cleanup helper to prevent memory leaks
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        try {
          window.removeEventListener("message", handleResponse);
        } catch (e) {
          // Ignore cleanup errors
        }
      };

      // Timeout with configurable duration (allow user interaction time)
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          console.warn(
            "Navigation Guardian: Permission check timed out for:",
            url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS)
          );
          // Timeout is not an error - just deny navigation
          resolve(false);
        }
      }, CONFIG.PERMISSION_CHECK_TIMEOUT_MS);

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
            console.log(
              `Navigation Guardian: Permission ${
                allowed ? "granted" : "denied"
              } for:`,
              url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS)
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
        console.log("Navigation Guardian: Requesting permission for:", url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS));
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
  async function safeCheckNavigationPermission(url, navType) {
    const truncatedUrl = url?.substring(0, CONFIG.MAX_URL_LENGTH_IN_LOGS) || '';

    for (let attempt = 0; attempt <= CONFIG.MAX_PERMISSION_RETRIES; attempt++) {
      try {
        return await checkNavigationPermission(url);
      } catch (error) {
        // Log error with URL context for debugging
        console.warn(
          `Navigation Guardian: ${navType} check failed for URL "${truncatedUrl}" (attempt ${attempt + 1}/${CONFIG.MAX_PERMISSION_RETRIES + 1}):`,
          error
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

          console.warn(
            `Navigation Guardian: Using ${isHighRisk ? 'DENY' : 'ALLOW'} fallback for ${navType} on URL "${truncatedUrl}" (risk: ${isHighRisk ? 'HIGH' : 'LOW'})`
          );

          return shouldAllowOnError;
        }

        // Brief delay before retry to allow transient errors to resolve
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
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
      console.warn('Navigation Guardian: Error checking URL maliciousness:', error);
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
      console.info(
        'Navigation Guardian: Blocked deprecated "unload" event listener. Use "pagehide" with { capture: true } instead.'
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
        console.log("Navigation Guardian: Blocked malicious click listener:", {
          target: this.tagName || this.constructor.name,
          riskScore: analysis.riskScore,
          threats: analysis.threats,
          listenerPreview: listenerStr.substring(0, 200) + "...",
          options: options,
        });

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
          console.log("Navigation Guardian: Removing malicious script:", {
            riskScore: analysis.riskScore,
            threats: analysis.threats,
            contentPreview: content.substring(0, 100) + "...",
          });
          script.remove();
          localBlockedCount++;
          blockedScriptsCount++; // Update global counter
        }
      });

      if (localBlockedCount > 0 || blockedScriptsCount > 0) {
        reportStats();
      }
    } catch (error) {
      console.warn(
        "Navigation Guardian: Error cleaning up malicious listeners:",
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

  // Enhanced window.open override with aggressive pop-under protection
  overrideStatus.windowOpen = safeOverride(
    window,
    "open",
    function (url, name, features) {
      const analysis = isPopUnderBehavior(url, name, features);

      // Block obvious pop-unders immediately
      if (analysis.isPopUnder) {
        console.log("Navigation Guardian: Blocked pop-under attempt:", {
          url: url,
          score: analysis.score,
          factors: analysis.factors,
        });

        // Show a brief notification
        console.warn("🛡️ OriginalUI blocked a pop-under advertisement");

        return null;
      }

      // Allow same-origin navigation
      if (!isCrossOrigin(url)) {
        return originalWindowOpen.call(this, url, name, features);
      }

      // For cross-origin URLs that aren't obvious pop-unders, check permission
      safeCheckNavigationPermission(url, 'window.open')
        .then((allowed) => {
          if (allowed) {
            originalWindowOpen.call(window, url, name, features);
          }
        })
        .catch((error) => {
          // This should never happen since safeCheckNavigationPermission handles all errors,
          // but add defensive catch just in case
          console.error('Navigation Guardian: Unexpected error in window.open:', error);
          reportPermissionError(error, url, 'window.open', true);
          // Fail-secure: deny navigation
        });

      // Return null for blocked navigation
      return null;
    },
    "method"
  );

  // Override location.assign (may fail on some sites)
  if (originalLocationAssign) {
    overrideStatus.locationAssign = safeOverride(
      window.location,
      "assign",
      function (url) {
        if (!isCrossOrigin(url)) {
          return originalLocationAssign.call(this, url);
        }

        safeCheckNavigationPermission(url, 'location.assign')
          .then((allowed) => {
            if (allowed) {
              originalLocationAssign.call(window.location, url);
            }
          })
          .catch((error) => {
            console.error('Navigation Guardian: Unexpected error in location.assign:', error);
            reportPermissionError(error, url, 'location.assign', true);
            // Fail-secure: deny navigation
          });
      },
      "method"
    );
  }

  // Override location.replace (may fail on some sites)
  if (originalLocationReplace) {
    overrideStatus.locationReplace = safeOverride(
      window.location,
      "replace",
      function (url) {
        if (!isCrossOrigin(url)) {
          return originalLocationReplace.call(this, url);
        }

        safeCheckNavigationPermission(url, 'location.replace')
          .then((allowed) => {
            if (allowed) {
              originalLocationReplace.call(window.location, url);
            }
          })
          .catch((error) => {
            console.error('Navigation Guardian: Unexpected error in location.replace:', error);
            reportPermissionError(error, url, 'location.replace', true);
            // Fail-secure: deny navigation
          });
      },
      "method"
    );
  }

  // Override location.href setter (often fails due to browser security)
  if (originalHrefDescriptor && originalHrefDescriptor.set) {
    overrideStatus.locationHref = safeDefineProperty(
      window.location,
      "href",
      {
        get: originalHrefDescriptor.get,
        set: function (url) {
          if (!isCrossOrigin(url)) {
            return originalHrefDescriptor.set.call(this, url);
          }

          safeCheckNavigationPermission(url, 'location.href')
            .then((allowed) => {
              if (allowed) {
                originalHrefDescriptor.set.call(window.location, url);
              }
            })
            .catch((error) => {
              console.error('Navigation Guardian: Unexpected error in location.href:', error);
              reportPermissionError(error, url, 'location.href', false);
              // Fail-open for location.href (low-risk, often user-initiated)
              // This is a safety net - risk assessment should handle this, but if something
              // unexpected happens, allow the navigation anyway for better UX
              try {
                originalHrefDescriptor.set.call(window.location, url);
              } catch (navError) {
                console.error('Navigation Guardian: Failed to execute fail-open navigation:', navError);
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

  console.log("Navigation Guardian: JavaScript overrides status:", {
    successful: successfulOverrides,
    failed: failedOverrides,
    note:
      failedOverrides.length > 0
        ? "Some overrides failed - relying on DOM interception"
        : "All overrides successful",
  });
})();
