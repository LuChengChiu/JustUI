// Background script for JustUI Chrome Extension
// Coordinates communication between popup and content scripts

const REMOTE_RULES_URL =
  "https://raw.githubusercontent.com/LuChengChiu/JustUI/main/src/data/defaultRules.json";
const REMOTE_WHITELIST_URL =
  "https://raw.githubusercontent.com/LuChengChiu/JustUI/main/src/data/defaultWhitelist.json";

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
  try {
    // Try to fetch from remote URL first
    const response = await fetch(REMOTE_WHITELIST_URL);
    if (response.ok) {
      const remoteWhitelist = await response.json();
      console.log("Fetched whitelist from remote URL", remoteWhitelist);
      return remoteWhitelist;
    }
  } catch (error) {
    console.log(
      "Failed to fetch remote whitelist, falling back to local:",
      error.message
    );
  }

  // Fallback to local default whitelist
  try {
    const localResponse = await fetch(
      chrome.runtime.getURL("data/defaultWhitelist.json")
    );
    const localWhitelist = await localResponse.json();
    console.log("Using local default whitelist");
    return localWhitelist;
  } catch (error) {
    console.error("Failed to load local default whitelist:", error);
    return [];
  }
}

// Initialize default storage structure on installation
chrome.runtime.onInstalled.addListener(async () => {
  const [defaultRules, defaultWhitelist] = await Promise.all([
    fetchDefaultRules(),
    fetchDefaultWhitelist(),
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
      "navigationGuardEnabled",
      "navigationStats",
    ],
    (result) => {
      const updates = {};

      if (result.isActive === undefined) updates.isActive = false;
      if (!result.customRules) updates.customRules = [];
      if (result.defaultRulesEnabled === undefined)
        updates.defaultRulesEnabled = true;
      if (result.customRulesEnabled === undefined)
        updates.customRulesEnabled = true;
      if (result.navigationGuardEnabled === undefined)
        updates.navigationGuardEnabled = true;
      if (!result.navigationStats)
        updates.navigationStats = { blockedCount: 0, allowedCount: 0 };

      // Always update default rules from remote
      updates.defaultRules = defaultRules;

      // Merge default whitelist with user's custom additions
      const customWhitelist = result.customWhitelist || [];
      updates.whitelist = [
        ...new Set([...defaultWhitelist, ...customWhitelist]),
      ];

      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
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
    const [defaultRules, defaultWhitelist] = await Promise.all([
      fetchDefaultRules(),
      fetchDefaultWhitelist(),
    ]);

    // Update rules but preserve user's whitelist additions
    chrome.storage.local.get(["whitelist"], (result) => {
      const currentWhitelist = result.whitelist || [];
      const mergedWhitelist = [
        ...new Set([...defaultWhitelist, ...currentWhitelist]),
      ];

      chrome.storage.local.set({
        defaultRules,
        whitelist: mergedWhitelist,
      });
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
});

// Handle storage changes and notify content scripts
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
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
