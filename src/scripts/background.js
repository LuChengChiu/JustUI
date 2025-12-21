// Background script for JustUI Chrome Extension
// Coordinates communication between popup and content scripts

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
  try {
    console.log("JustUI: Starting updateBlockingRules...");

    const { blockRequestList = [], requestBlockingEnabled = true } =
      await chrome.storage.local.get([
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
  const [defaultRules, defaultWhitelist, defaultBlockRequests] =
    await Promise.all([
      fetchDefaultRules(),
      fetchDefaultWhitelist(),
      fetchDefaultBlockRequests(),
    ]);

  // Set default storage values if not already set
  chrome.storage.local.get(
    [
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
    ],
    (result) => {
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
        chrome.storage.local.set(updates, () => {
          // Initialize request blocking rules after storage is set
          updateBlockingRules();
        });
      } else {
        // Still need to initialize blocking rules if no updates
        updateBlockingRules();
      }
    }
  );

  // Periodically update default rules and whitelist (once per day)
  chrome.alarms.create("updateDefaults", {
    delayInMinutes: 1440,
    periodInMinutes: 1440,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "updateDefaults") {
    const [defaultRules, defaultWhitelist, defaultBlockRequests] =
      await Promise.all([
        fetchDefaultRules(),
        fetchDefaultWhitelist(),
        fetchDefaultBlockRequests(),
      ]);

    // Update rules but preserve user's whitelist additions
    chrome.storage.local.get(["whitelist", "blockRequestList"], (result) => {
      const currentWhitelist = result.whitelist || [];
      const mergedWhitelist = [
        ...new Set([...defaultWhitelist, ...currentWhitelist]),
      ];

      chrome.storage.local.set(
        {
          defaultRules,
          whitelist: mergedWhitelist,
          blockRequestList: defaultBlockRequests,
        },
        () => {
          // Update blocking rules after storage update
          updateBlockingRules();
        }
      );
    });
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
    chrome.storage.local.get(["whitelist"], (result) => {
      let whitelist = result.whitelist || [];

      if (whitelistAction === "add" && !whitelist.includes(domain)) {
        whitelist.push(domain);
      } else if (whitelistAction === "remove") {
        whitelist = whitelist.filter((d) => d !== domain);
      }

      chrome.storage.local.set({ whitelist }, () => {
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
      });
    });
    return true;
  }

  if (request.action === "refreshDefaultRules") {
    fetchDefaultRules().then((rules) => {
      chrome.storage.local.set({ defaultRules: rules }, () => {
        sendResponse({ success: true, rules });
      });
    });
    return true;
  }

  if (request.action === "refreshDefaultWhitelist") {
    fetchDefaultWhitelist().then((whitelist) => {
      chrome.storage.local.get(["whitelist"], (result) => {
        const currentWhitelist = result.whitelist || [];
        const mergedWhitelist = [
          ...new Set([...whitelist, ...currentWhitelist]),
        ];

        chrome.storage.local.set({ whitelist: mergedWhitelist }, () => {
          sendResponse({ success: true, whitelist: mergedWhitelist });
        });
      });
    });
    return true;
  }

  if (request.action === "refreshDefaultBlockRequests") {
    fetchDefaultBlockRequests().then((blockRequests) => {
      chrome.storage.local.set({ blockRequestList: blockRequests }, () => {
        updateBlockingRules().then(() => {
          sendResponse({ success: true, blockRequests });
        });
      });
    });
    return true;
  }

  if (request.action === "updateRequestBlocking") {
    const { enabled } = request;
    chrome.storage.local.set({ requestBlockingEnabled: enabled }, () => {
      updateBlockingRules().then(() => {
        sendResponse({ success: true, enabled });
      });
    });
    return true;
  }

  if (request.action === "recordBlockedRequest") {
    const { data } = request;
    // Store blocked request statistics
    chrome.storage.local.get(["blockedRequestStats"], (result) => {
      const stats = result.blockedRequestStats || {
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

      chrome.storage.local.set({ blockedRequestStats: stats });
    });
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
      chrome.storage.local.get(['scriptAnalysisEnabled'], (result) => {
        if (!result.scriptAnalysisEnabled) {
          chrome.storage.local.set({ scriptAnalysisEnabled: true });
        }
      });
    }
    
    // Master toggle enforcement: Auto-enable both layers when Pop-under Protection is enabled
    if (changes.popUnderProtectionEnabled && changes.popUnderProtectionEnabled.newValue === true) {
      chrome.storage.local.get(['scriptAnalysisEnabled', 'navigationGuardEnabled'], (result) => {
        const updates = {};
        if (!result.scriptAnalysisEnabled) {
          updates.scriptAnalysisEnabled = true;
        }
        if (!result.navigationGuardEnabled) {
          updates.navigationGuardEnabled = true;
        }
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates);
        }
      });
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
