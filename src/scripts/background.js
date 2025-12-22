// Background script for JustUI Chrome Extension
// Coordinates communication between popup and content scripts

import {
  isExtensionContextValid,
  safeStorageGet,
  safeStorageSet,
  safeStorageSetWithValidation
} from './utils/chromeApiSafe.js';

const REMOTE_RULES_URL =
  "https://raw.githubusercontent.com/LuChengChiu/JustUI/main/src/data/defaultRules.json";
const REMOTE_WHITELIST_URL =
  "https://raw.githubusercontent.com/LuChengChiu/JustUI/main/src/data/defaultWhitelist.json";
const REMOTE_BLOCK_REQUESTS_URL =
  "https://raw.githubusercontent.com/LuChengChiu/JustUI/main/src/data/defaultBlockRequests.json";

// Fetch default rules from remote URL with fallback to local file
async function fetchDefaultRules() {
  // try {
  //   // Try to fetch from remote URL first
  //   const response = await fetch(REMOTE_RULES_URL);
  //   if (response.ok) {
  //     const remoteRules = await response.json();
  //     console.log("Fetched rules from remote URL", remoteRules);
  //     return remoteRules;
  //   }
  // } catch (error) {
  //   console.log(
  //     "Failed to fetch remote rules, falling back to local:",
  //     error.message
  //   );
  // }

  // Fallback to local default rules
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultRules.json")
    );
    const localRules = await localResponse.json();
    console.log("Using local default rules", localRules);
    return localRules;
  } catch (error) {
    console.error("Failed to load local default rules:", error);
    return [];
  }
}

// Fetch default whitelist from remote URL with fallback to local file
async function fetchDefaultWhitelist() {
  // try {
  //   // Try to fetch from remote URL first
  //   const response = await fetch(REMOTE_WHITELIST_URL);
  //   if (response.ok) {
  //     const remoteWhitelist = await response.json();
  //     console.log("Fetched whitelist from remote URL", remoteWhitelist);
  //     return remoteWhitelist;
  //   }
  // } catch (error) {
  //   console.log(
  //     "Failed to fetch remote whitelist, falling back to local:",
  //     error.message
  //   );
  // }

  // Fallback to local default whitelist
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultWhitelist.json")
    );
    const localWhitelist = await localResponse.json();
    console.log("Using local default whitelist", localWhitelist);
    return localWhitelist;
  } catch (error) {
    console.error("Failed to load local default whitelist:", error);
    return [];
  }
}

// Fetch default block request list from remote URL with fallback to local file
async function fetchDefaultBlockRequests() {
  // try {
  //   // Try to fetch from remote URL first
  //   const response = await fetch(REMOTE_BLOCK_REQUESTS_URL);
  //   if (response.ok) {
  //     const remoteBlockRequests = await response.json();
  //     console.log("Fetched block requests from remote URL", remoteBlockRequests);
  //     return remoteBlockRequests;
  //   }
  // } catch (error) {
  //   console.log(
  //     "Failed to fetch remote block requests, falling back to local:",
  //     error.message
  //   );
  // }

  // Fallback to local default block requests
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultBlockRequests.json")
    );
    const localBlockRequests = await localResponse.json();
    console.log("Using local default block requests", localBlockRequests);
    return localBlockRequests;
  } catch (error) {
    console.error("Failed to load local default block requests:", error);
    return [
      "malware-site.com",
      "tracking-api.io",
      "suspicious-ads.net",
      "malicious-redirect.com",
    ];
  }
}

// Request blocking system using declarativeNetRequest API
// Convert block request entries to declarativeNetRequest rules
function createBlockingRules(blockRequests) {
  // Valid resourceTypes according to Chrome's declarativeNetRequest API
  const validResourceTypes = new Set([
    "csp_report",
    "font",
    "image",
    "main_frame",
    "media",
    "object",
    "other",
    "ping",
    "script",
    "stylesheet",
    "sub_frame",
    "webbundle",
    "websocket",
    "webtransport",
    "xmlhttprequest",
  ]);

  return blockRequests.map((entry, index) => {
    // Determine priority based on severity
    let priority = 1;
    if (entry.severity === "critical") priority = 3;
    else if (entry.severity === "high") priority = 2;

    // Use resourceTypes from entry or default fallback
    // Filter out invalid resourceTypes and convert 'fetch' to 'xmlhttprequest'
    let resourceTypes = entry.resourceTypes || ["xmlhttprequest", "script"];
    resourceTypes = resourceTypes
      .map((type) => (type === "fetch" ? "xmlhttprequest" : type))
      .filter((type) => validResourceTypes.has(type));

    // Ensure we have at least one valid resourceType
    if (resourceTypes.length === 0) {
      resourceTypes = ["xmlhttprequest"];
    }

    // Handle regex patterns vs domain patterns
    let condition;
    if (entry.isRegex) {
      condition = {
        regexFilter: entry.trigger,
        resourceTypes,
      };
    } else {
      condition = {
        // urlFilter: `*://${entry.trigger}/*`,
        urlFilter: `*://*.${entry.trigger}/*`, // Would create: "*://*.pubfuture-ad.com/*"
        resourceTypes,
      };
    }

    // Use safe ID range starting from 10000 to avoid conflicts
    const baseId = parseInt(entry.id.replace(/\D/g, "")) || index + 1;
    const rule = {
      id: 10000 + baseId, // uBO_011 becomes 10011, avoiding conflicts
      priority,
      action: { type: "block" },
      condition,
    };

    // Debug logging for rule creation
    console.log(`JustUI: Creating blocking rule for ${entry.trigger}:`, {
      id: rule.id,
      urlFilter: condition.urlFilter,
      resourceTypes: condition.resourceTypes,
      priority: rule.priority,
    });

    return rule;
  });
}

// Update dynamic blocking rules
async function updateBlockingRules() {
  // Context validation before proceeding
  if (!isExtensionContextValid()) {
    console.warn('JustUI: Extension context invalid, skipping blocking rules update');
    return;
  }

  try {
    console.log("JustUI: Starting updateBlockingRules...");

    const { blockRequestList = [], requestBlockingEnabled = true } =
      await safeStorageGet([
        "blockRequestList",
        "requestBlockingEnabled",
      ]);

    console.log("JustUI: Storage retrieved:", {
      blockRequestListCount: blockRequestList.length,
      requestBlockingEnabled,
      blockRequestList: blockRequestList.map((r) => ({
        id: r.id,
        trigger: r.trigger,
      })),
    });

    if (!requestBlockingEnabled) {
      // Remove all dynamic rules if blocking is disabled
      const existingRules =
        await chrome.declarativeNetRequest.getDynamicRules();
      const existingRuleIds = existingRules.map((rule) => rule.id);
      if (existingRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingRuleIds,
        });
      }
      console.log("Request blocking disabled, removed all rules");
      return;
    }

    // Get current dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((rule) => rule.id);
    console.log("JustUI: Existing rules count:", existingRules.length);

    // Remove existing rules and add new ones
    const newRules = createBlockingRules(blockRequestList);
    console.log("JustUI: Created new rules count:", newRules.length);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: newRules,
    });

    // Verify rules were applied
    const finalRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log("JustUI: Rules successfully updated:", {
      removedCount: existingRuleIds.length,
      addedCount: newRules.length,
      finalRulesCount: finalRules.length,
      pubfutureRule: finalRules.find((r) =>
        r.condition?.urlFilter?.includes("pubfuture-ad.com")
      ),
    });

    console.log(
      `Updated blocking rules for ${blockRequestList.length} domains`
    );
  } catch (error) {
    console.error("Failed to update blocking rules:", error);
  }
}

// Initialize default storage structure on installation
chrome.runtime.onInstalled.addListener(async () => {
  // Early context validation check
  if (!isExtensionContextValid()) {
    console.warn('JustUI: Extension context invalid during installation, skipping initialization');
    return;
  }

  const [defaultRules, defaultWhitelist, defaultBlockRequests] =
    await Promise.all([
      fetchDefaultRules(),
      fetchDefaultWhitelist(),
      fetchDefaultBlockRequests(),
    ]);

  // Set default storage values if not already set
  try {
    const result = await safeStorageGet([
      "isActive",
      "whitelist",
      "customWhitelist",
      "defaultRules",
      "customRules",
      "defaultRulesEnabled",
      "customRulesEnabled",
      "patternRulesEnabled",
      "navigationGuardEnabled",
      "popUnderProtectionEnabled",
      "scriptAnalysisEnabled",
      "navigationStats",
      "blockRequestList",
      "requestBlockingEnabled",
    ]);
    const updates = {};

    if (result.isActive === undefined) updates.isActive = false;
    if (!result.customRules) updates.customRules = [];
    if (result.defaultRulesEnabled === undefined)
      updates.defaultRulesEnabled = true;
    if (result.customRulesEnabled === undefined)
      updates.customRulesEnabled = true;
    if (result.patternRulesEnabled === undefined)
      updates.patternRulesEnabled = true;
    if (result.navigationGuardEnabled === undefined)
      updates.navigationGuardEnabled = true;
    if (result.popUnderProtectionEnabled === undefined)
      updates.popUnderProtectionEnabled = true;
    if (result.scriptAnalysisEnabled === undefined)
      updates.scriptAnalysisEnabled = true;
    
    // Smart dependency: Ensure Script Analysis is enabled when Navigation Guardian is active
    if (result.navigationGuardEnabled !== false && result.scriptAnalysisEnabled === false) {
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
    if (!result.blockRequestList)
      updates.blockRequestList = defaultBlockRequests;
    if (result.requestBlockingEnabled === undefined)
      updates.requestBlockingEnabled = true;

    // Always update default rules from remote
    updates.defaultRules = defaultRules;

    // FORCE UPDATE: Always refresh blockRequestList with latest data
    updates.blockRequestList = defaultBlockRequests;
    console.log(
      "JustUI: FORCE updating blockRequestList with",
      defaultBlockRequests.length,
      "entries"
    );

    // Merge default whitelist with user's custom additions
    const customWhitelist = result.customWhitelist || [];
    updates.whitelist = [
      ...new Set([...defaultWhitelist, ...customWhitelist]),
    ];

    if (Object.keys(updates).length > 0) {
      const installationResult = await safeStorageSetWithValidation(updates, ['blockRequestList', 'defaultRules']);
      if (!installationResult.success) {
        console.error('JustUI Installation Warning: Some settings may not have been saved properly:', {
          inconsistencies: installationResult.validationResult?.inconsistencies,
          context: 'extension-installation'
        });
        // Continue anyway - this is installation, partial success is acceptable
      }
      // Initialize request blocking rules after storage is set
      updateBlockingRules();
    } else {
      // Still need to initialize blocking rules if no updates
      updateBlockingRules();
    }
  } catch (error) {
    console.error('JustUI: Failed to initialize default storage during installation:', error);
    // Attempt to initialize blocking rules even if storage initialization failed
    try {
      updateBlockingRules();
    } catch (rulesError) {
      console.error('JustUI: Failed to initialize blocking rules during installation:', rulesError);
    }
  }

  // Periodically update default rules and whitelist (once per day)
  chrome.alarms.create("updateDefaults", {
    delayInMinutes: 1440,
    periodInMinutes: 1440,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Context validation before proceeding
  if (!isExtensionContextValid()) {
    console.warn('JustUI: Extension context invalid during alarm listener, skipping update');
    return;
  }

  if (alarm.name === "updateDefaults") {
    try {
      const [defaultRules, defaultWhitelist, defaultBlockRequests] =
        await Promise.all([
          fetchDefaultRules(),
          fetchDefaultWhitelist(),
          fetchDefaultBlockRequests(),
        ]);

      // Update rules but preserve user's whitelist additions
      const storageResult = await safeStorageGet(["whitelist", "blockRequestList"]);
      const currentWhitelist = storageResult.whitelist || [];
      const mergedWhitelist = [
        ...new Set([...defaultWhitelist, ...currentWhitelist]),
      ];

      const updateResult = await safeStorageSetWithValidation({
        defaultRules,
        whitelist: mergedWhitelist,
        blockRequestList: defaultBlockRequests,
      }, ['blockRequestList', 'defaultRules', 'whitelist']);
      
      if (!updateResult.success) {
        console.error('JustUI Update Failed: Scheduled update could not be completed:', {
          inconsistencies: updateResult.validationResult?.inconsistencies,
          context: 'scheduled-update',
          timestamp: new Date().toISOString()
        });
        // For scheduled updates, we can be more strict and skip rule updates if storage failed
        return;
      }

      // Update blocking rules after storage update
      updateBlockingRules();
    } catch (error) {
      console.error('JustUI: Failed to update defaults during scheduled alarm:', error);
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCurrentDomain") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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
    (async () => {
      try {
        const whitelistResult = await safeStorageGet(["whitelist"]);
        let whitelist = whitelistResult.whitelist || [];

        if (whitelistAction === "add" && !whitelist.includes(domain)) {
          whitelist.push(domain);
        } else if (whitelistAction === "remove") {
          whitelist = whitelist.filter((d) => d !== domain);
        }

        const whitelistUpdateResult = await safeStorageSetWithValidation({ whitelist }, ['whitelist']);
        if (!whitelistUpdateResult.success) {
          throw new Error(`Whitelist update validation failed: ${whitelistUpdateResult.validationResult?.inconsistencies?.join(', ')}`);
        }
        sendResponse({ success: true, whitelist });
        // Notify content script of whitelist change
        chrome.tabs.query({}, (tabs) => {
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
        console.error('Failed to update whitelist:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to save whitelist changes. Please try again.',
          details: error.message 
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
        console.error('Failed to refresh default rules:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to update default rules. Please check your internet connection.',
          details: error.message 
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
        console.error('Failed to refresh default whitelist:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to update whitelist. Please check your internet connection.',
          details: error.message 
        });
      }
    })();
    return true;
  }

  if (request.action === "refreshDefaultBlockRequests") {
    (async () => {
      try {
        const blockRequests = await fetchDefaultBlockRequests();
        const blockRequestUpdateResult = await safeStorageSetWithValidation({ blockRequestList: blockRequests }, ['blockRequestList']);
        if (!blockRequestUpdateResult.success) {
          throw new Error(`Block request list update validation failed: ${blockRequestUpdateResult.validationResult?.inconsistencies?.join(', ')}`);
        }
        await updateBlockingRules();
        sendResponse({ success: true, blockRequests });
      } catch (error) {
        console.error('Failed to refresh default block requests:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to update blocking rules. Some network protection may be unavailable.',
          details: error.message 
        });
      }
    })();
    return true;
  }

  if (request.action === "updateRequestBlocking") {
    const { enabled } = request;
    (async () => {
      try {
        await safeStorageSet({ requestBlockingEnabled: enabled });
        await updateBlockingRules();
        sendResponse({ success: true, enabled });
      } catch (error) {
        console.error('Failed to update request blocking setting:', error);
        sendResponse({ 
          success: false, 
          error: 'Failed to update network blocking settings. Protection status may be inconsistent.',
          details: error.message 
        });
      }
    })();
    return true;
  }

  if (request.action === "recordBlockedRequest") {
    const { data } = request;
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
        console.error('Failed to store blocked request stats:', error);
        // Note: No user response needed for stats - this is background logging
      }
    })();
    return false; // No response needed
  }

  if (request.action === "getRemoteRulesUrl") {
    sendResponse({ url: REMOTE_RULES_URL });
    return false;
  }
});

// Handle storage changes and notify content scripts
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
    // Smart dependency enforcement: Auto-enable Script Analysis when Navigation Guardian is enabled
    if (changes.navigationGuardEnabled && changes.navigationGuardEnabled.newValue === true) {
      (async () => {
        try {
          const scriptAnalysisResult = await safeStorageGet(['scriptAnalysisEnabled']);
          if (!scriptAnalysisResult.scriptAnalysisEnabled) {
            await safeStorageSet({ scriptAnalysisEnabled: true });
          }
        } catch (error) {
          console.error('Failed to enable script analysis for navigation guard dependency:', error);
        }
      })();
    }
    
    // Master toggle enforcement: Auto-enable both layers when Pop-under Protection is enabled
    if (changes.popUnderProtectionEnabled && changes.popUnderProtectionEnabled.newValue === true) {
      (async () => {
        try {
          const dependenciesResult = await safeStorageGet(['scriptAnalysisEnabled', 'navigationGuardEnabled']);
          const updates = {};
          if (!dependenciesResult.scriptAnalysisEnabled) {
            updates.scriptAnalysisEnabled = true;
          }
          if (!dependenciesResult.navigationGuardEnabled) {
            updates.navigationGuardEnabled = true;
          }
          if (Object.keys(updates).length > 0) {
            await safeStorageSet(updates);
          }
        } catch (error) {
          console.error('Failed to enable pop-under protection dependencies:', error);
        }
      })();
    }

    // Update blocking rules if request blocking settings changed
    if (changes.blockRequestList || changes.requestBlockingEnabled) {
      updateBlockingRules();
    }

    // Notify all content scripts of storage changes
    chrome.tabs.query({}, (tabs) => {
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
