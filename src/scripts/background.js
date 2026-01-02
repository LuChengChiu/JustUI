// Background script for OriginalUI Chrome Extension
// Coordinates communication between popup and content scripts

import {
  isExtensionContextValid,
  safeStorageGet,
  safeStorageSet,
  safeStorageSetWithValidation,
} from "./utils/chrome-api-safe.js";

// Background Utility Imports
import { EasyListDomSource } from "./modules/rule-execution/sources/easylist-dom-source.js";
import {
  isTrustedUISender,
  isValidDomain,
  isValidExtensionSender,
} from "./utils/background/message-validators.js";
import { rateLimiter } from "./utils/background/rate-limiter.js";
import {
  fetchDefaultRules,
  fetchDefaultWhitelist,
  REMOTE_URLS,
} from "./utils/background/remote-data-fetcher.js";

// Network Blocking System Imports
import { RULE_SOURCES_CONFIG } from "./modules/network-blocking/config/sources.config.js";
import { BudgetCoordinator } from "./modules/network-blocking/core/budget-coordinator.js";
import { JsonRuleConverter } from "./modules/network-blocking/core/json-rule-converter.js";
import { NetworkBlockManager } from "./modules/network-blocking/core/network-block-manager.js";
import { JsonRuleParser } from "./modules/network-blocking/parsers/json-rule-parser.js";
import {
  CustomPatternSource,
  DefaultBlockSource,
} from "./modules/network-blocking/sources/index.js";
import { DynamicRuleUpdater } from "./modules/network-blocking/updaters/dynamic-rule-updater.js";

// Initialize custom pattern source (Priority 1 - Highest)
const customPatternSource = new CustomPatternSource(
  RULE_SOURCES_CONFIG.customPatterns.name,
  RULE_SOURCES_CONFIG.customPatterns.idRange.start,
  RULE_SOURCES_CONFIG.customPatterns.idRange.end,
  RULE_SOURCES_CONFIG.customPatterns.updateInterval
);

// Initialize default block requests source (Priority 2)
// Note: EasyList sources are static-only due to @eyeo/abp2dnr native dependencies
const defaultBlockSource = new DefaultBlockSource(
  RULE_SOURCES_CONFIG.defaultBlocks.name,
  RULE_SOURCES_CONFIG.defaultBlocks.url,
  RULE_SOURCES_CONFIG.defaultBlocks.idRange.start,
  RULE_SOURCES_CONFIG.defaultBlocks.idRange.end,
  RULE_SOURCES_CONFIG.defaultBlocks.updateInterval
);

// Create budget coordinator (30,000 dynamic rule limit)
const DYNAMIC_RULE_LIMIT = 30000;

// Time intervals in minutes for scheduled updates
const UPDATE_INTERVAL = {
  DAILY: 24 * 60, // 1440 minutes
  WEEKLY: 7 * 24 * 60, // 10080 minutes
};

const budgetCoordinator = new BudgetCoordinator(DYNAMIC_RULE_LIMIT);

// Create manager with priority-ordered sources and budget coordination
const defaultBlockManager = new NetworkBlockManager(
  [customPatternSource, defaultBlockSource], // Priority order: custom > default
  new DynamicRuleUpdater(),
  new JsonRuleParser(),
  new JsonRuleConverter(),
  budgetCoordinator
);

/**
 * Unified control for static EasyList rulesets
 * NOTE: EasyList rules are pre-converted at build time and loaded as static rulesets
 * Only defaultBlockRequests use dynamic runtime updates
 */
async function updateRulesetStates(enabled) {
  const staticRulesetIds = ["easylist-adservers"];

  try {
    if (enabled) {
      // Enable static rulesets (EasyList adservers)
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: staticRulesetIds,
      });
      console.log("✅ Static rulesets enabled:", staticRulesetIds);

      // NEW: Trigger dynamic rule updates from NetworkBlockManager (JSON rules only)
      try {
        await defaultBlockManager.updateAll();
        console.log("✅ Dynamic NetworkBlockManager rules updated");
      } catch (error) {
        console.error(
          "Failed to update dynamic rules via NetworkBlockManager:",
          error
        );
      }
      return;
    }
    // Disable static rulesets
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: staticRulesetIds,
    });

    // Clear all dynamic rules (IDs 10000-64999 - expanded for custom patterns)
    const allDynamicIds = [];
    for (let id = 10000; id <= 64999; id++) {
      allDynamicIds.push(id);
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: allDynamicIds,
    });

    console.log("🚫 All network blocking disabled");
  } catch (error) {
    console.error("Failed to update ruleset states:", error);
  }
}

async function ensureAlarm(name, options) {
  try {
    const existing = await chrome.alarms.get(name);
    const periodMatches = existing?.periodInMinutes === options.periodInMinutes;

    if (!existing || !periodMatches) {
      if (existing) {
        await chrome.alarms.clear(name);
      }
      chrome.alarms.create(name, options);
    }
  } catch (error) {
    console.error(`OriginalUI: Failed to ensure alarm ${name}:`, error);
  }
}

// ============================================================================
// INSTALLATION STATE MANAGEMENT
// ============================================================================

const INSTALLATION_STATE = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
};

// Simple in-memory mutex to prevent concurrent installations
let installationPromise = null;

/**
 * Robust installation with resumability and atomic commits
 * Handles service worker termination gracefully
 */
async function performInstallation() {
  // Mutex: Return existing promise if installation already running
  if (installationPromise) {
    return installationPromise;
  }

  installationPromise = _performInstallationImpl();

  try {
    await installationPromise;
  } finally {
    installationPromise = null;
  }
}

async function _performInstallationImpl() {
  // Check installation state + backward compatibility
  const stateCheck = await safeStorageGet([
    "installationState",
    "isActive",
    "defaultRules",
  ]);

  // BACKWARD COMPATIBILITY: Detect legacy installations (no installationState field)
  if (
    !stateCheck.installationState &&
    (stateCheck.isActive !== undefined || stateCheck.defaultRules)
  ) {
    console.log("OriginalUI: Legacy installation detected, marking complete");
    await chrome.storage.local.set({
      installationState: INSTALLATION_STATE.COMPLETED,
      installationCompleteTime: Date.now(),
    });
    return;
  }

  if (stateCheck.installationState === INSTALLATION_STATE.COMPLETED) {
    console.log("OriginalUI: Installation already completed, skipping");
    return;
  }

  try {
    // CHECKPOINT 1: Mark installation as in progress
    await chrome.storage.local.set({
      installationState: INSTALLATION_STATE.IN_PROGRESS,
      installationStartTime: Date.now(),
    });

    // STEP 1: Fetch remote data (can be retried - idempotent)
    const [defaultRules, defaultWhitelist] = await Promise.all([
      fetchDefaultRules(),
      fetchDefaultWhitelist(),
    ]);

    // STEP 2: Read current storage state (can be retried - idempotent)
    const result = await safeStorageGet([
      "isActive",
      "whitelist",
      "customWhitelist",
      "defaultRules",
      "customRules",
      "defaultRulesEnabled",
      "customRulesEnabled",
      "navigationGuardEnabled",
      "popUnderProtectionEnabled",
      "scriptAnalysisEnabled",
      "navigationStats",
      "defaultBlockRequestEnabled",
      "networkBlockPatterns",
    ]);

    // STEP 3: Build complete settings object (pure computation - safe)
    const updates = {};

    if (result.isActive === undefined) updates.isActive = false;
    if (!result.customRules) updates.customRules = [];
    if (result.defaultRulesEnabled === undefined)
      updates.defaultRulesEnabled = true;
    if (result.customRulesEnabled === undefined)
      updates.customRulesEnabled = true;
    if (result.navigationGuardEnabled === undefined)
      updates.navigationGuardEnabled = true;
    if (result.popUnderProtectionEnabled === undefined)
      updates.popUnderProtectionEnabled = true;
    if (result.scriptAnalysisEnabled === undefined)
      updates.scriptAnalysisEnabled = true;
    if (result.defaultBlockRequestEnabled === undefined)
      updates.defaultBlockRequestEnabled = true;

    // Smart dependency: Ensure Script Analysis is enabled when Navigation Guardian is active
    if (
      result.navigationGuardEnabled !== false &&
      result.scriptAnalysisEnabled === false
    ) {
      updates.scriptAnalysisEnabled = true;
    }

    // Master toggle dependency: Auto-enable both layers when Pop-under Protection is active
    if (result.popUnderProtectionEnabled !== false) {
      if (result.scriptAnalysisEnabled === false) {
        updates.scriptAnalysisEnabled = true;
      }
      if (result.navigationGuardEnabled === false) {
        updates.navigationGuardEnabled = true;
      }
    }

    if (!result.navigationStats)
      updates.navigationStats = { blockedCount: 0, allowedCount: 0 };
    if (!result.networkBlockPatterns) updates.networkBlockPatterns = [];

    // Always update default rules from remote
    updates.defaultRules = defaultRules;

    // Merge default whitelist with user's custom additions
    const customWhitelist = result.customWhitelist || [];
    updates.whitelist = [...new Set([...defaultWhitelist, ...customWhitelist])];

    // STEP 4: ATOMIC COMMIT - Write all settings in single operation
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      console.log(
        "OriginalUI Installation: Successfully saved all settings:",
        Object.keys(updates)
      );
    }

    // STEP 5: Configure network blocking (can be retried - idempotent)
    const blockingEnabled = updates.defaultBlockRequestEnabled !== false;
    await updateRulesetStates(blockingEnabled);

    // STEP 6: Setup alarms (idempotent - creating existing alarms is safe)
    await ensureAlarm("updateDefaults", {
      delayInMinutes: UPDATE_INTERVAL.DAILY,
      periodInMinutes: UPDATE_INTERVAL.DAILY,
    });

    await ensureAlarm("updateDefaultBlocksDaily", {
      delayInMinutes: UPDATE_INTERVAL.DAILY,
      periodInMinutes: UPDATE_INTERVAL.DAILY,
    });

    await ensureAlarm("updateEasyListDomRules", {
      delayInMinutes: UPDATE_INTERVAL.WEEKLY,
      periodInMinutes: UPDATE_INTERVAL.WEEKLY,
    });

    // CHECKPOINT 2: Mark installation as completed (COMMIT POINT)
    await chrome.storage.local.set({
      installationState: INSTALLATION_STATE.COMPLETED,
      installationCompleteTime: Date.now(),
    });

    console.log("OriginalUI: Installation completed successfully");
  } catch (error) {
    console.error("OriginalUI: Installation failed:", error);

    // Reset installation state to allow retry on next startup
    await chrome.storage.local.set({
      installationState: INSTALLATION_STATE.NOT_STARTED,
      lastInstallationError: error.message,
      lastInstallationErrorTime: Date.now(),
    });

    throw error; // Re-throw to allow caller to handle
  }
}

// Initialize default storage structure on installation
chrome.runtime.onInstalled.addListener(async () => {
  // Early context validation check
  if (!isExtensionContextValid()) {
    console.warn(
      "OriginalUI: Extension context invalid during installation, skipping initialization"
    );
    return;
  }

  try {
    await performInstallation();
  } catch (error) {
    console.error("OriginalUI: Installation handler caught error:", error);
    // Error already logged in performInstallation, state already reset
  }
});

// Resume incomplete installation on startup (recovery mechanism)
chrome.runtime.onStartup.addListener(async () => {
  if (!isExtensionContextValid()) {
    return;
  }

  const stateCheck = await safeStorageGet(["installationState"]);

  if (stateCheck.installationState === INSTALLATION_STATE.IN_PROGRESS) {
    console.warn("OriginalUI: Detected incomplete installation, resuming...");
    try {
      await performInstallation();
    } catch (error) {
      console.error("OriginalUI: Installation resume failed:", error);
    }
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Context validation before proceeding
  if (!isExtensionContextValid()) {
    console.warn(
      "OriginalUI: Extension context invalid during alarm listener, skipping update"
    );
    return;
  }

  if (alarm.name === "updateDefaults") {
    try {
      const [defaultRules, defaultWhitelist] = await Promise.all([
        fetchDefaultRules(),
        fetchDefaultWhitelist(),
      ]);

      // Update rules but preserve user's whitelist additions
      const storageResult = await safeStorageGet(["whitelist"]);
      const currentWhitelist = storageResult.whitelist || [];
      const mergedWhitelist = [
        ...new Set([...defaultWhitelist, ...currentWhitelist]),
      ];

      const updateResult = await safeStorageSetWithValidation(
        {
          defaultRules,
          whitelist: mergedWhitelist,
        },
        ["defaultRules", "whitelist"],
        { requireValidation: false, validateWrite: false }
      );

      if (!updateResult.success) {
        console.error(
          "OriginalUI Update Failed: Scheduled update could not be completed:",
          {
            inconsistencies: updateResult.validationResult?.inconsistencies,
            context: "scheduled-update",
            timestamp: new Date().toISOString(),
          }
        );
      }
    } catch (error) {
      console.error(
        "OriginalUI: Failed to update defaults during scheduled alarm:",
        error
      );
    }
  }

  // NEW: Daily default blocks updates (JSON-based)
  if (alarm.name === "updateDefaultBlocksDaily") {
    try {
      console.log("🔄 Running daily default blocks update...");
      await defaultBlockManager.updateAll();
    } catch (error) {
      console.error("OriginalUI: Failed to update default blocks:", error);
    }
  }

  // NEW: Weekly EasyList DOM rules cache refresh
  if (alarm.name === "updateEasyListDomRules") {
    try {
      console.log("🔄 Running weekly EasyList DOM rules update...");
      const source = new EasyListDomSource();
      await source.fetchRules(); // Force refresh from network
      console.log("✅ EasyList DOM rules cache refreshed");
    } catch (error) {
      console.error("OriginalUI: Failed to update EasyList DOM rules:", error);
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ============================================================================
  // SECURITY: VALIDATION LAYER
  // ============================================================================

  // All actions require valid extension sender
  if (!isValidExtensionSender(sender)) {
    sendResponse({
      success: false,
      error: "Invalid sender - message rejected",
    });
    return false;
  }

  // Validate request structure
  if (!request || typeof request.action !== "string") {
    console.warn("OriginalUI: Invalid request structure");
    sendResponse({
      success: false,
      error: "Invalid request structure",
    });
    return false;
  }

  const { action } = request;

  // Critical actions require trusted UI sender (popup/settings only)
  const criticalActions = [
    "updateWhitelist",
    "refreshDefaultRules",
    "refreshDefaultWhitelist",
  ];

  if (criticalActions.includes(action)) {
    if (!isTrustedUISender(sender)) {
      console.error(
        `OriginalUI: Rejected critical action "${action}" from untrusted sender:`,
        sender.url
      );
      sendResponse({
        success: false,
        error: "Unauthorized - action requires trusted UI sender",
      });
      return false;
    }

    // Rate limiting for critical actions
    if (!rateLimiter.checkLimit(action, sender)) {
      sendResponse({
        success: false,
        error: "Rate limit exceeded - please try again later",
      });
      return false;
    }
  }

  // ============================================================================
  // ACTION HANDLERS (with input validation)
  // ============================================================================

  if (request.action === "getCurrentDomain") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error(
          "OriginalUI: Failed to query active tab:",
          chrome.runtime.lastError
        );
        sendResponse({
          domain: null,
          error:
            chrome.runtime.lastError.message || "Failed to query active tab",
        });
        return;
      }
      if (tabs[0]) {
        try {
          const domain = new URL(tabs[0].url).hostname;
          sendResponse({ domain });
        } catch (error) {
          sendResponse({ domain: null, error: "Invalid URL" });
        }
      } else {
        sendResponse({ domain: null, error: "No active tab" });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === "checkDomainWhitelist") {
    const { domain } = request;

    // VALIDATE INPUT
    if (!isValidDomain(domain)) {
      console.warn(
        "OriginalUI: Invalid domain in checkDomainWhitelist:",
        domain
      );
      sendResponse({
        success: false,
        error: "Invalid domain format",
      });
      return false;
    }

    chrome.storage.local.get(["whitelist"], (result) => {
      const whitelist = result.whitelist || [];
      // Check if domain or its parent domain is whitelisted
      // e.g., www.youtube.com matches youtube.com
      const isWhitelisted = whitelist.some((whitelistedDomain) => {
        return (
          domain === whitelistedDomain ||
          domain.endsWith("." + whitelistedDomain)
        );
      });
      sendResponse({ isWhitelisted });
    });
    return true;
  }

  if (request.action === "updateWhitelist") {
    const { domain, whitelistAction } = request;

    // VALIDATE INPUTS
    if (!isValidDomain(domain)) {
      console.warn("OriginalUI: Invalid domain in updateWhitelist:", domain);
      sendResponse({
        success: false,
        error: "Invalid domain format",
      });
      return false;
    }

    if (!["add", "remove"].includes(whitelistAction)) {
      console.warn("OriginalUI: Invalid whitelistAction:", whitelistAction);
      sendResponse({
        success: false,
        error: 'Invalid action - must be "add" or "remove"',
      });
      return false;
    }

    (async () => {
      try {
        const whitelistResult = await safeStorageGet(["whitelist"]);
        let whitelist = whitelistResult.whitelist || [];

        // Additional validation: Check whitelist size limit
        if (whitelistAction === "add" && whitelist.length >= 1000) {
          console.warn("OriginalUI: Whitelist size limit exceeded");
          sendResponse({
            success: false,
            error: "Whitelist size limit exceeded (max 1000 domains)",
          });
          return;
        }

        if (whitelistAction === "add" && !whitelist.includes(domain)) {
          whitelist.push(domain);
        } else if (whitelistAction === "remove") {
          whitelist = whitelist.filter((d) => d !== domain);
        }

        const whitelistUpdateResult = await safeStorageSetWithValidation(
          { whitelist },
          ["whitelist"]
        );
        if (!whitelistUpdateResult.success) {
          throw new Error(
            `Whitelist update validation failed: ${whitelistUpdateResult.validationResult?.inconsistencies?.join(
              ", "
            )}`
          );
        }
        sendResponse({ success: true, whitelist });
        // Notify content script of whitelist change
        chrome.tabs.query({}, (tabs) => {
          if (chrome.runtime.lastError) {
            console.error(
              "OriginalUI: Failed to query tabs for whitelist update:",
              chrome.runtime.lastError
            );
            return;
          }
          tabs.forEach((tab) => {
            if (tab.url && tab.url.startsWith("http")) {
              chrome.tabs
                .sendMessage(tab.id, {
                  action: "whitelistUpdated",
                  whitelist,
                })
                .catch(() => {}); // Ignore errors for tabs without content script
            }
          });
        });
      } catch (error) {
        console.error("Failed to update whitelist:", error);
        sendResponse({
          success: false,
          error: "Failed to save whitelist changes. Please try again.",
          details: error.message,
        });
      }
    })();
    return true;
  }

  if (request.action === "refreshDefaultRules") {
    (async () => {
      try {
        const rules = await fetchDefaultRules();
        await safeStorageSet({ defaultRules: rules });
        sendResponse({ success: true, rules });
      } catch (error) {
        console.error("Failed to refresh default rules:", error);
        sendResponse({
          success: false,
          error:
            "Failed to update default rules. Please check your internet connection.",
          details: error.message,
        });
      }
    })();
    return true;
  }

  if (request.action === "refreshDefaultWhitelist") {
    (async () => {
      try {
        const whitelist = await fetchDefaultWhitelist();
        const whitelistFetchResult = await safeStorageGet(["whitelist"]);
        const currentWhitelist = whitelistFetchResult.whitelist || [];
        const mergedWhitelist = [
          ...new Set([...whitelist, ...currentWhitelist]),
        ];

        await safeStorageSet({ whitelist: mergedWhitelist });
        sendResponse({ success: true, whitelist: mergedWhitelist });
      } catch (error) {
        console.error("Failed to refresh default whitelist:", error);
        sendResponse({
          success: false,
          error:
            "Failed to update whitelist. Please check your internet connection.",
          details: error.message,
        });
      }
    })();
    return true;
  }

  if (request.action === "recordBlockedRequest") {
    const { data } = request;

    // VALIDATE INPUT
    if (!data || typeof data !== "object" || !data.type || !data.url) {
      console.warn("OriginalUI: Invalid data in recordBlockedRequest");
      sendResponse({
        success: false,
        error: "Invalid data format",
      });
      return false;
    }

    // Validate URL format
    try {
      new URL(data.url);
    } catch (e) {
      console.warn(
        "OriginalUI: Invalid URL in recordBlockedRequest:",
        data.url
      );
      sendResponse({
        success: false,
        error: "Invalid URL format",
      });
      return false;
    }

    // Store blocked request statistics asynchronously
    (async () => {
      try {
        const statsResult = await safeStorageGet(["blockedRequestStats"]);
        const stats = statsResult.blockedRequestStats || {
          totalBlocked: 0,
          byType: {},
          byDomain: {},
          recentBlocks: [],
        };

        stats.totalBlocked++;
        stats.byType[data.type] = (stats.byType[data.type] || 0) + 1;

        try {
          const domain = new URL(data.url).hostname;
          stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
        } catch (error) {
          // Invalid URL, skip domain stats
        }

        // Keep only last 100 recent blocks
        stats.recentBlocks.unshift(data);
        if (stats.recentBlocks.length > 100) {
          stats.recentBlocks = stats.recentBlocks.slice(0, 100);
        }

        await safeStorageSet({ blockedRequestStats: stats });
      } catch (error) {
        console.error("Failed to store blocked request stats:", error);
        // Note: No user response needed for stats - this is background logging
      }
    })();

    // IMPORTANT: Send response and return true for sendResponse
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "getRemoteRulesUrl") {
    sendResponse({ url: REMOTE_URLS.RULES });
    return false;
  }
});

// ============================================================================
// INFINITE LOOP PREVENTION
// ============================================================================

/**
 * Internal marker to identify storage updates triggered by dependency enforcement
 * This prevents infinite loops in the onChanged listener
 */
const INTERNAL_UPDATE_MARKER = "__internal_dependency_update__";

/**
 * Wrapper for safeStorageSet that marks updates as internal
 * This prevents the onChanged listener from re-processing its own changes
 *
 * @param {Object} updates - Storage updates to apply
 * @returns {Promise<void>}
 */
async function setStorageWithMarker(updates) {
  // Mark this as an internal update with timestamp
  const markedUpdates = {
    ...updates,
    [INTERNAL_UPDATE_MARKER]: Date.now(),
  };

  // Write to storage (will trigger onChanged listener)
  await safeStorageSet(markedUpdates);

  // Clean up marker immediately after (non-blocking)
  chrome.storage.local.remove(INTERNAL_UPDATE_MARKER).catch(() => {
    // Ignore cleanup errors - marker will be filtered anyway
  });
}

// Handle storage changes and notify content scripts
chrome.storage.onChanged.addListener((changes, namespace) => {
  // CRITICAL: Ignore our own internal dependency updates to prevent infinite loops
  if (changes[INTERNAL_UPDATE_MARKER]) {
    return;
  }

  if (namespace === "local") {
    // Smart dependency enforcement: Auto-enable Script Analysis when Navigation Guardian is enabled
    if (
      changes.navigationGuardEnabled &&
      changes.navigationGuardEnabled.newValue === true
    ) {
      (async () => {
        try {
          const scriptAnalysisResult = await safeStorageGet([
            "scriptAnalysisEnabled",
          ]);
          if (!scriptAnalysisResult.scriptAnalysisEnabled) {
            await setStorageWithMarker({ scriptAnalysisEnabled: true });
          }
        } catch (error) {
          console.error(
            "Failed to enable script analysis for navigation guard dependency:",
            error
          );
        }
      })();
    }

    // Master toggle enforcement: Auto-enable both layers when Pop-under Protection is enabled
    if (
      changes.popUnderProtectionEnabled &&
      changes.popUnderProtectionEnabled.newValue === true
    ) {
      (async () => {
        try {
          const dependenciesResult = await safeStorageGet([
            "scriptAnalysisEnabled",
            "navigationGuardEnabled",
          ]);
          const updates = {};
          if (!dependenciesResult.scriptAnalysisEnabled) {
            updates.scriptAnalysisEnabled = true;
          }
          if (!dependenciesResult.navigationGuardEnabled) {
            updates.navigationGuardEnabled = true;
          }
          if (Object.keys(updates).length > 0) {
            await setStorageWithMarker(updates);
          }
        } catch (error) {
          console.error(
            "Failed to enable pop-under protection dependencies:",
            error
          );
        }
      })();
    }

    // React to defaultBlockRequestEnabled toggle
    if (changes.defaultBlockRequestEnabled) {
      const enabled = changes.defaultBlockRequestEnabled.newValue;
      (async () => {
        try {
          await updateRulesetStates(enabled);
        } catch (error) {
          console.error("Failed to update ruleset states on toggle:", error);
        }
      })();
    }
  }

  // Handle networkBlockPatterns changes (stored in local)
  if (namespace === "local" && changes.networkBlockPatterns) {
    console.log("🔄 Custom patterns updated, refreshing rules...");
    (async () => {
      try {
        await defaultBlockManager.updateSource(customPatternSource);
        console.log("✅ Custom patterns updated successfully");
      } catch (error) {
        console.error("Failed to update custom patterns:", error);
      }
    })();
  }

  // Notify all content scripts of storage changes (for local changes)
  if (namespace === "local") {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error(
          "OriginalUI: Failed to query tabs for storage changes:",
          chrome.runtime.lastError
        );
        return;
      }
      tabs.forEach((tab) => {
        if (tab.url && tab.url.startsWith("http")) {
          chrome.tabs
            .sendMessage(tab.id, {
              action: "storageChanged",
              changes,
            })
            .catch(() => {}); // Ignore errors for tabs without content script
        }
      });
    });
  }
});
