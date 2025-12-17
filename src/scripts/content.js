// Content script for JustUI Chrome Extension
// Handles DOM element removal based on rules and whitelist

let isActive = false;
let whitelist = [];
let defaultRules = [];
let customRules = [];
let defaultRulesEnabled = true;
let customRulesEnabled = true;
let currentDomain = "";
let domainStats = {}; // Per-domain statistics
let patternRulesEnabled = true; // New pattern-based detection
let adDetectionEngine = null;

// Navigation Guardian variables
let navigationGuardEnabled = true;
let navigationStats = { blockedCount: 0, allowedCount: 0 };

// Get current domain
function getCurrentDomain() {
  try {
    return new URL(window.location.href).hostname;
  } catch (error) {
    return "";
  }
}

// Helper function to match domain with potential subdomain pattern
function domainMatches(domain, pattern) {
  // If pattern has wildcard prefix (*.example.com)
  if (pattern.startsWith("*.")) {
    const baseDomain = pattern.slice(2);
    return domain === baseDomain || domain.endsWith("." + baseDomain);
  }

  // Exact match
  if (domain === pattern) return true;

  // Also match subdomains for patterns without wildcard
  // e.g., if "youtube.com" is whitelisted, "www.youtube.com" should also match
  if (domain.endsWith("." + pattern)) return true;

  return false;
}

// Check if current domain is whitelisted (with caching)
let cachedWhitelistResult = null;
let cachedWhitelistDomain = null;

function isDomainWhitelisted(domain) {
  // Return cached result if domain and whitelist haven't changed
  if (cachedWhitelistDomain === domain && cachedWhitelistResult !== null) {
    return cachedWhitelistResult;
  }

  cachedWhitelistDomain = domain;
  cachedWhitelistResult = whitelist.some((whitelistedDomain) =>
    domainMatches(domain, whitelistedDomain)
  );

  return cachedWhitelistResult;
}

// Navigation Guardian: Check if URL is cross-origin
function isCrossOrigin(url) {
  if (!url) return false;
  
  // Ignore special protocols and hash links
  if (/^(javascript|mailto|tel|data|blob|about):|^#/.test(url)) {
    return false;
  }
  
  try {
    const targetUrl = new URL(url, window.location.href);
    return targetUrl.hostname !== window.location.hostname;
  } catch (error) {
    return false;
  }
}

// Navigation Guardian: Check if target domain is trusted (reuses whitelist)
function isNavigationTrusted(url) {
  if (!url) return false;
  
  try {
    const targetUrl = new URL(url, window.location.href);
    return isDomainWhitelisted(targetUrl.hostname);
  } catch (error) {
    return false;
  }
}

// Invalidate cache when whitelist changes
function invalidateWhitelistCache() {
  cachedWhitelistResult = null;
  cachedWhitelistDomain = null;
}

// Navigation Guardian: Show confirmation modal
function showNavigationModal(targetURL, callback) {
  // Prevent multiple modals for the same URL
  const existingModal = document.getElementById('justui-navigation-modal');
  if (existingModal) {
    console.warn('JustUI: Navigation modal already exists, ignoring duplicate');
    return;
  }

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'justui-navigation-modal';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Create modal card
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    animation: justui-modal-appear 0.2s ease-out;
  `;

  // Add modal animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes justui-modal-appear {
      from {
        opacity: 0;
        transform: scale(0.9) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);

  // Escape HTML to prevent XSS
  const safeURL = targetURL.replace(/[<>&"']/g, function(match) {
    const entities = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' };
    return entities[match];
  });

  modal.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #1f2937;">Navigation Guardian</h3>
      <p style="margin: 0; color: #6b7280; line-height: 1.5;">
        This page is trying to navigate to an external site:
      </p>
    </div>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 20px; word-break: break-all; font-family: monospace; font-size: 14px; color: #374151;">
      ${safeURL}
    </div>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="justui-nav-deny" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">Block</button>
      <button id="justui-nav-allow" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">Allow</button>
    </div>
  `;

  overlay.appendChild(modal);

  // Track if the modal has been responded to (prevent double-calling callback)
  let hasResponded = false;

  // Handle responses
  function cleanup() {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }

  function handleAllow() {
    if (hasResponded) return;
    hasResponded = true;
    
    console.log('JustUI: Navigation Guardian - User allowed navigation to:', targetURL);
    cleanup();
    navigationStats.allowedCount++;
    updateNavigationStats();
    callback(true);
  }

  function handleDeny() {
    if (hasResponded) return;
    hasResponded = true;
    
    console.log('JustUI: Navigation Guardian - User blocked navigation to:', targetURL);
    cleanup();
    navigationStats.blockedCount++;
    updateNavigationStats();
    callback(false);
  }

  // Event listeners with immediate response
  const allowButton = modal.querySelector('#justui-nav-allow');
  const denyButton = modal.querySelector('#justui-nav-deny');
  
  allowButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleAllow();
  }, { once: true }); // Ensure it only fires once
  
  denyButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDeny();
  }, { once: true }); // Ensure it only fires once

  // Keyboard support
  const keydownHandler = (e) => {
    if (hasResponded) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleDeny();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAllow();
    }
  };
  
  overlay.addEventListener('keydown', keydownHandler);

  // Prevent overlay clicks from closing modal (only button clicks should work)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Add modal to page and focus
  document.body.appendChild(overlay);
  
  // Focus deny button by default (safer choice) with delay to ensure DOM is ready
  setTimeout(() => {
    if (!hasResponded && denyButton) {
      denyButton.focus();
    }
  }, 100);
  
  console.log('JustUI: Navigation Guardian modal displayed for:', targetURL);
}

// Navigation Guardian: Update stats in storage
function updateNavigationStats() {
  chrome.storage.local.set({ navigationStats });
}

// Navigation Guardian: Handle link clicks
function handleLinkClick(event) {
  if (!navigationGuardEnabled) return;
  
  const link = event.target.closest('a');
  if (!link) return;
  
  const href = link.getAttribute('href');
  if (!href || !isCrossOrigin(href)) return;
  
  // Skip if target domain is whitelisted
  if (isNavigationTrusted(href)) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  showNavigationModal(href, (allowed) => {
    if (allowed) {
      if (link.target === '_blank') {
        window.open(href, '_blank');
      } else {
        window.location.href = href;
      }
    }
  });
}

// Navigation Guardian: Handle form submissions
function handleFormSubmit(event) {
  if (!navigationGuardEnabled) return;
  
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  
  const action = form.getAttribute('action') || window.location.href;
  if (!isCrossOrigin(action)) return;
  
  // Skip if target domain is whitelisted
  if (isNavigationTrusted(action)) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  showNavigationModal(action, (allowed) => {
    if (allowed) {
      if (form.target === '_blank') {
        const newForm = form.cloneNode(true);
        newForm.target = '_blank';
        document.body.appendChild(newForm);
        newForm.submit();
        document.body.removeChild(newForm);
      } else {
        form.submit();
      }
    }
  });
}

// Track pending navigation modals to prevent multiple modals and ensure cleanup
let pendingNavigationModals = new Map();

// Navigation Guardian: Handle injected script communication
function handleNavigationMessage(event) {
  if (event.source !== window) return;
  
  if (event.data?.type === 'NAV_GUARDIAN_CHECK') {
    const { url, messageId } = event.data;
    
    // If this messageId is already being processed, ignore duplicate
    if (pendingNavigationModals.has(messageId)) {
      return;
    }
    
    let allowed = true;
    
    if (navigationGuardEnabled && isCrossOrigin(url) && !isNavigationTrusted(url)) {
      // Track this modal to prevent duplicates
      pendingNavigationModals.set(messageId, true);
      
      showNavigationModal(url, (userAllowed) => {
        // Remove from pending map
        pendingNavigationModals.delete(messageId);
        
        // Send response with the user's decision
        window.postMessage({
          type: 'NAV_GUARDIAN_RESPONSE',
          messageId: messageId,
          allowed: userAllowed
        }, '*');
      });
      return; // Don't send immediate response
    }
    
    // Send immediate response for allowed navigation
    window.postMessage({
      type: 'NAV_GUARDIAN_RESPONSE',
      messageId: messageId,
      allowed: allowed
    }, '*');
  }
}

// Check if rule applies to current domain
function ruleAppliesTo(rule, domain) {
  if (!rule.domains || rule.domains.length === 0) return false;

  // Check for wildcard
  if (rule.domains.includes("*")) return true;

  // Check for exact match or subdomain match
  return rule.domains.some((ruleDomain) => domainMatches(domain, ruleDomain));
}

// Advanced pattern-based element detection
async function executePatternRules() {
  if (!adDetectionEngine || !patternRulesEnabled) return 0;

  let patternRemovedCount = 0;

  try {
    // Get all potentially suspicious elements
    const suspiciousElements = document.querySelectorAll(
      "div, iframe, section, aside, nav, header"
    );

    for (const element of suspiciousElements) {
      // Skip if already processed
      if (element.hasAttribute("data-justui-removed")) continue;

      // Run pattern analysis
      const analysis = await adDetectionEngine.analyze(element);

      if (analysis.isAd && analysis.confidence > 0.7) {
        // Mark element with detection details
        element.setAttribute(
          "data-justui-removed",
          `pattern-${analysis.totalScore}`
        );
        element.setAttribute(
          "data-justui-confidence",
          Math.round(analysis.confidence * 100)
        );
        element.setAttribute(
          "data-justui-rules",
          analysis.matchedRules.map((r) => r.rule).join(",")
        );

        // Hide the element
        element.style.display = "none";
        patternRemovedCount++;

        console.log(
          `JustUI: Pattern detection removed element (score: ${
            analysis.totalScore
          }, confidence: ${Math.round(analysis.confidence * 100)}%)`,
          {
            rules: analysis.matchedRules,
            element:
              element.tagName +
              (element.className ? `.${element.className}` : ""),
          }
        );
      }
    }

    if (patternRemovedCount > 0) {
      console.log(
        `JustUI: Pattern rules removed ${patternRemovedCount} suspicious elements`
      );
    }
  } catch (error) {
    console.error("JustUI: Error in pattern rule execution:", error);
  }

  return patternRemovedCount;
}

// Navigation Guardian: Inject script into page
function injectNavigationScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('scripts/injected-script.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    console.log('JustUI: Navigation Guardian injected script loaded');
  } catch (error) {
    console.error('JustUI: Failed to inject navigation script:', error);
  }
}

// Navigation Guardian: Setup event listeners
function setupNavigationListeners() {
  // Listen for link clicks (capture phase to intercept early)
  document.addEventListener('click', handleLinkClick, true);
  
  // Listen for form submissions (capture phase)
  document.addEventListener('submit', handleFormSubmit, true);
  
  // Listen for messages from injected script
  window.addEventListener('message', handleNavigationMessage);
  
  console.log('JustUI: Navigation Guardian listeners setup complete');
}

// Execute rules to remove elements
async function executeRules() {
  console.log("JustUI: executeRules called", {
    isActive,
    isDomainWhitelisted: isDomainWhitelisted(currentDomain),
    currentDomain,
  });

  if (!isActive || isDomainWhitelisted(currentDomain)) {
    console.log(
      "JustUI: Skipping execution - extension inactive or domain whitelisted"
    );
    return;
  }

  let removedCount = 0;
  let sessionDefaultRemoved = 0;
  let sessionCustomRemoved = 0;
  let sessionPatternRemoved = 0;

  // Execute default rules
  if (defaultRulesEnabled) {
    const enabledDefaultRules = defaultRules.filter((rule) => rule.enabled);
    enabledDefaultRules.forEach((rule) => {
      if (!ruleAppliesTo(rule, currentDomain)) return;

      try {
        const elements = document.querySelectorAll(rule.selector);
        elements.forEach((element) => {
          // Skip if already processed by JustUI
          if (element.hasAttribute("data-justui-removed")) return;

          // Add a data attribute before removing for debugging
          element.setAttribute("data-justui-removed", rule.id);
          element.style.display = "none";
          // Optional: completely remove from DOM
          // element.remove();
          removedCount++;
          sessionDefaultRemoved++;
        });

        if (elements.length > 0) {
          console.log(
            `JustUI: Default Rule "${rule.description}" removed ${elements.length} elements`
          );
        }
      } catch (error) {
        console.error(`JustUI: Error executing rule "${rule.id}":`, error);
      }
    });
  }

  // Execute custom rules
  if (customRulesEnabled) {
    const enabledCustomRules = customRules.filter((rule) => rule.enabled);
    enabledCustomRules.forEach((rule) => {
      if (!ruleAppliesTo(rule, currentDomain)) return;

      try {
        const elements = document.querySelectorAll(rule.selector);
        elements.forEach((element) => {
          // Skip if already processed by JustUI
          if (element.hasAttribute("data-justui-removed")) return;

          // Add a data attribute before removing for debugging
          element.setAttribute("data-justui-removed", rule.id);
          element.style.display = "none";
          // Optional: completely remove from DOM
          // element.remove();
          removedCount++;
          sessionCustomRemoved++;
        });

        if (elements.length > 0) {
          console.log(
            `JustUI: Custom Rule "${rule.description}" removed ${elements.length} elements`
          );
        }
      } catch (error) {
        console.error(`JustUI: Error executing rule "${rule.id}":`, error);
      }
    });
  }

  // Execute advanced pattern-based detection
  if (patternRulesEnabled) {
    try {
      sessionPatternRemoved = await executePatternRules();
      removedCount += sessionPatternRemoved;
    } catch (error) {
      console.error("JustUI: Error executing pattern rules:", error);
    }
  }

  // Update domain-specific counters (session-only, reset on page refresh)
  if (!domainStats[currentDomain]) {
    domainStats[currentDomain] = {
      defaultRulesRemoved: 0,
      customRulesRemoved: 0,
    };
  }

  // Set absolute values instead of accumulating (session-only counts)
  domainStats[currentDomain].defaultRulesRemoved =
    sessionDefaultRemoved + sessionPatternRemoved;
  domainStats[currentDomain].customRulesRemoved = sessionCustomRemoved;

  if (removedCount > 0) {
    console.log(
      `JustUI: Total elements processed: ${removedCount} (Default: ${sessionDefaultRemoved}, Custom: ${sessionCustomRemoved}, Pattern: ${sessionPatternRemoved})`
    );

    // Store per-domain counts for popup display
    chrome.storage.local.set({
      domainStats,
    });
  }
}

// Initialize content script
async function initialize() {
  currentDomain = getCurrentDomain();
  console.log("JustUI: Initializing on domain:", currentDomain);

  // Initialize Navigation Guardian
  injectNavigationScript();
  setupNavigationListeners();

  // Setup DOM observer for dynamic content
  setupDOMObserver();

  // Initialize advanced detection engine
  if (typeof AdDetectionEngine !== "undefined") {
    adDetectionEngine = new AdDetectionEngine();
    console.log("JustUI: AdDetectionEngine initialized");
  } else {
    console.warn(
      "JustUI: AdDetectionEngine not available, pattern detection disabled"
    );
  }

  // Load initial settings from storage
  chrome.storage.local.get(
    [
      "isActive",
      "whitelist",
      "defaultRules",
      "customRules",
      "defaultRulesEnabled",
      "customRulesEnabled",
      "patternRulesEnabled",
      "navigationGuardEnabled",
      "navigationStats",
    ],
    (result) => {
      isActive = result.isActive || false;
      whitelist = result.whitelist || [];
      defaultRules = result.defaultRules || [];
      customRules = result.customRules || [];
      defaultRulesEnabled = result.defaultRulesEnabled !== false;
      customRulesEnabled = result.customRulesEnabled !== false;
      patternRulesEnabled = result.patternRulesEnabled !== false;
      navigationGuardEnabled = result.navigationGuardEnabled !== false;
      navigationStats = result.navigationStats || { blockedCount: 0, allowedCount: 0 };
      // Initialize domainStats as empty object for session-only tracking
      domainStats = {};

      console.log("JustUI: Settings loaded", {
        isActive,
        isDomainWhitelisted: isDomainWhitelisted(currentDomain),
        defaultRulesCount: defaultRules.length,
        customRulesCount: customRules.length,
        defaultRulesEnabled,
        customRulesEnabled,
        patternRulesEnabled,
        navigationGuardEnabled,
        adDetectionEngine: !!adDetectionEngine,
      });

      // Execute rules on initial load
      if (isActive && !isDomainWhitelisted(currentDomain)) {
        executeRules();
      }
    }
  );
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "storageChanged") {
    const changes = request.changes;
    let shouldReExecute = false;

    if (changes.isActive) {
      isActive = changes.isActive.newValue;
      shouldReExecute = true;
    }
    if (changes.whitelist) {
      whitelist = changes.whitelist.newValue;
      invalidateWhitelistCache();
      shouldReExecute = true;
    }
    if (changes.defaultRules) {
      defaultRules = changes.defaultRules.newValue;
      shouldReExecute = true;
    }
    if (changes.customRules) {
      customRules = changes.customRules.newValue;
      shouldReExecute = true;
    }
    if (changes.defaultRulesEnabled) {
      defaultRulesEnabled = changes.defaultRulesEnabled.newValue;
      shouldReExecute = true;
    }
    if (changes.customRulesEnabled) {
      customRulesEnabled = changes.customRulesEnabled.newValue;
      shouldReExecute = true;
    }
    if (changes.patternRulesEnabled) {
      patternRulesEnabled = changes.patternRulesEnabled.newValue;
      shouldReExecute = true;
    }
    if (changes.navigationGuardEnabled) {
      navigationGuardEnabled = changes.navigationGuardEnabled.newValue;
    }
    if (changes.navigationStats) {
      navigationStats = changes.navigationStats.newValue;
    }

    // Only re-execute rules when settings that affect execution change
    // Don't re-execute when only counts change (prevents infinite loop)
    if (shouldReExecute) {
      executeRules();
    }
  }

  if (request.action === "whitelistUpdated") {
    whitelist = request.whitelist;
    invalidateWhitelistCache();
    executeRules();
  }

  if (request.action === "executeRules") {
    executeRules();
    sendResponse({ success: true });
  }
});

// Observer for dynamically added content
let observer = null;

function createMutationObserver() {
  return new MutationObserver((mutations) => {
    if (!isActive || isDomainWhitelisted(currentDomain)) return;

    let shouldExecute = false;
    mutations.forEach((mutation) => {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        shouldExecute = true;
      }
    });

    if (shouldExecute) {
      // Debounce execution to avoid excessive processing
      clearTimeout(window.justUITimeout);
      window.justUITimeout = setTimeout(executeRules, 500);
    }
  });
}

// Setup DOM observation with proper error handling
function setupDOMObserver() {
  try {
    // Disconnect existing observer if any
    if (observer) {
      observer.disconnect();
    }

    observer = createMutationObserver();

    // Try to observe document.body first, fallback to document.documentElement
    const targetNode = document.body || document.documentElement;
    
    if (targetNode) {
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
      });
      console.log('JustUI: DOM observer setup on', targetNode.tagName);
    } else {
      // If neither body nor documentElement exists, wait for DOM to be ready
      console.warn('JustUI: No valid target node found, waiting for DOM...');
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupDOMObserver, { once: true });
      } else {
        // Fallback: try again in a short delay
        setTimeout(setupDOMObserver, 100);
      }
    }
  } catch (error) {
    console.error('JustUI: Error setting up DOM observer:', error);
    // Retry after a delay
    setTimeout(setupDOMObserver, 1000);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Clean up on unload
window.addEventListener("beforeunload", () => {
  if (observer) {
    observer.disconnect();
  }
  clearTimeout(window.justUITimeout);
});
