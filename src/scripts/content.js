/**
 * OriginalUI Content Script - Modular Architecture
 * Main orchestrator for ad blocking and click hijacking protection
 */

// Import modules
import { domainMatches } from "../utils/domainMatch.js";
import AdDetectionEngine from "./adDetectionEngine.js";
import { ClickHijackingProtector } from "./modules/ClickHijackingProtector.js";
import { ElementRemover } from "./modules/ElementRemover.js";
import { CleanupRegistry } from "./modules/cleanup-registry.js";
import { ScriptAnalyzer } from "./modules/ScriptAnalyzer.js";
import { NavigationGuardian } from "./modules/navigation-guardian/navigation-guardian.js";
import { createRuleExecutionSystem } from "./modules/rule-execution/config/sources.config.js";
import {
  debouncedStorageSet,
  isExtensionContextValid,
  safeStorageGet,
} from "./utils/chromeApiSafe.js";

/**
 * Main OriginalUI Controller - Orchestrates all protection modules
 */
class OriginalUIController {
  constructor() {
    // Core state
    this.isActive = false;
    this.currentDomain = this.getCurrentDomain();
    this.whitelist = [];
    this.whitelistCache = null;

    // Rule sets
    this.defaultRules = [];
    this.customRules = [];
    this.defaultRulesEnabled = true;
    this.customRulesEnabled = true;
    this.patternRulesEnabled = true;

    // Cleanup registry for memory leak prevention
    this.cleanupRegistry = new CleanupRegistry();

    // Protection modules

    this.scriptAnalyzer = new ScriptAnalyzer();
    this.cleanupRegistry.register(
      this.scriptAnalyzer,
      "ScriptAnalyzer",
      "normal"
    );

    this.clickProtector = new ClickHijackingProtector();
    this.cleanupRegistry.register(
      this.clickProtector,
      "ClickHijackingProtector",
      "normal"
    );

    this.navigationGuardian = new NavigationGuardian();
    this.cleanupRegistry.register(
      this.navigationGuardian,
      "NavigationGuardian",
      "high"
    );

    // Navigation Guardian settings (managed by NavigationGuardian module)
    this.navigationGuardEnabled = true;
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };

    // Statistics
    this.domainStats = {};
    this.adDetectionEngine = null;

    // Rule execution system (initialized in initialize())
    this.ruleExecutionManager = null;

    console.log(
      "OriginalUI: Controller initialized for domain:",
      this.currentDomain
    );
    console.log(
      "OriginalUI: Registered",
      this.cleanupRegistry.getModuleCount(),
      "cleanable modules:",
      this.cleanupRegistry.getModuleNames()
    );
  }

  /**
   * Initialize the controller and all protection systems
   */
  async initialize() {
    console.log("OriginalUI: Initializing protection systems...");

    // 1. FIRST: Load settings to get whitelist (before any protections)
    await this.loadSettings();

    // 2. Setup message listeners ALWAYS (needed for whitelist changes from popup)
    this.setupMessageListeners();

    // 3. Initialize AdDetectionEngine
    this.adDetectionEngine = new AdDetectionEngine();
    console.log("OriginalUI: AdDetectionEngine initialized");

    // 3.5. Initialize Rule Execution System
    this.ruleExecutionManager = await createRuleExecutionSystem();
    console.log("OriginalUI: Rule Execution System initialized");

    // 4. Check whitelist/active state BEFORE applying security protections
    if (!this.isActive || this.isDomainWhitelisted()) {
      console.log(
        "OriginalUI: Skipping protections - extension inactive or domain whitelisted",
        {
          isActive: this.isActive,
          isDomainWhitelisted: this.isDomainWhitelisted(),
        }
      );
      return; // Exit early - no protections needed
    }

    // 5. NOW activate security protections (domain is not whitelisted & extension is active)
    this.scriptAnalyzer.activate();

    // 6. Initialize NavigationGuardian with loaded settings
    this.navigationGuardian.initialize(this.whitelist, this.navigationStats);
    this.navigationGuardian.enable();

    // 7. Start all other protection systems
    this.startProtection();

    console.log("OriginalUI: Initialization complete");
  }

  /**
   * Start all protection systems
   */
  startProtection() {
    if (!this.isActive || this.isDomainWhitelisted()) {
      this.stopProtection();
      return;
    }

    console.log("OriginalUI: Starting protection systems");

    // Start click hijacking protection
    this.clickProtector.activate();

    // Initial rule execution
    this.executeRules();

    // Scan for existing threats
    this.performInitialScan();
  }

  /**
   * Stop all protection systems
   */
  stopProtection() {
    console.log("OriginalUI: Stopping protection systems");

    this.scriptAnalyzer.deactivate();
    this.clickProtector.deactivate();
    this.navigationGuardian.disable();
  }

  /**
   * Execute all enabled rule sets
   */
  async executeRules() {
    console.log("OriginalUI: Executing rules", {
      isActive: this.isActive,
      isDomainWhitelisted: this.isDomainWhitelisted(),
      currentDomain: this.currentDomain,
    });

    if (!this.isActive || this.isDomainWhitelisted()) {
      console.log(
        "OriginalUI: Skipping execution - extension inactive or domain whitelisted"
      );
      return;
    }

    // Build list of enabled sources for rule execution manager
    const enabledSources = [];
    if (this.defaultRulesEnabled) {
      enabledSources.push("default");
      enabledSources.push("easylist"); // EasyList bundled with default rules
    }
    if (this.customRulesEnabled) enabledSources.push("custom");

    // Execute rules via RuleExecutionManager
    const stats = await this.ruleExecutionManager.executeAllRules(
      this.currentDomain,
      { enabledSources, timeSlicing: true }
    );

    // Execute pattern-based detection (unchanged - handled separately)
    if (this.patternRulesEnabled && this.adDetectionEngine) {
      stats.patternRulesRemoved = await this.executePatternRules();
    }

    // Update statistics
    await this.updateDomainStats(stats);

    const totalRemoved = Object.values(stats).reduce(
      (sum, count) => sum + (typeof count === "number" ? count : 0),
      0
    );
    if (totalRemoved > 0) {
      console.log(`OriginalUI: Total elements removed: ${totalRemoved}`, stats);
    }
  }

  // NOTE: executeDefaultRules() and executeCustomRules() have been removed
  // They are now handled by RuleExecutionManager in rule-execution module
  // See: src/scripts/modules/rule-execution/

  /**
   * Execute pattern-based detection rules
   */
  async executePatternRules() {
    if (!this.adDetectionEngine) return 0;

    let removedCount = 0;
    const suspiciousElements = document.querySelectorAll(
      "div, iframe, section, aside, header"
    );

    if (suspiciousElements.length === 0) return 0;

    // Use simplified sequential processing
    for (const element of suspiciousElements) {
      try {
        if (!element.isConnected || ElementRemover.isProcessed(element))
          continue;

        const analysis = await this.adDetectionEngine.analyze(element);

        if (analysis.isAd && analysis.confidence > 0.7) {
          element.setAttribute(
            "data-justui-confidence",
            Math.round(analysis.confidence * 100)
          );
          element.setAttribute(
            "data-justui-rules",
            analysis.matchedRules.map((r) => r.rule).join(",")
          );

          if (
            ElementRemover.removeElement(
              element,
              `pattern-${analysis.totalScore}`,
              ElementRemover.REMOVAL_STRATEGIES.REMOVE
            )
          ) {
            removedCount++;
          }
        }
      } catch (error) {
        console.error("OriginalUI: Error in pattern analysis:", error);
      }
    }

    return removedCount;
  }

  /**
   * Yield control to the main thread using cooperative scheduling
   */
  async yieldToMainThread() {
    return new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(resolve, { timeout: 100 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * Perform initial scan for existing threats
   */
  performInitialScan() {
    console.log("OriginalUI: Performing initial threat scan");

    // Scan for click hijacking overlays
    const removedOverlays = this.clickProtector.scanAndRemoveExistingOverlays();

    // Get script analysis statistics
    const scriptStats = this.scriptAnalyzer.getStats();

    console.log(
      `OriginalUI: Initial scan complete. Removed ${removedOverlays} suspicious overlays, blocked ${scriptStats.blockedScriptsCount} scripts`
    );
  }

  /**
   * Load settings from Chrome storage
   */
  async loadSettings() {
    try {
      const result = await safeStorageGet([
        "isActive",
        "whitelist",
        "defaultRules",
        "customRules",
        "defaultRulesEnabled",
        "customRulesEnabled",
        "patternRulesEnabled",
        "navigationGuardEnabled",
        "navigationStats",
      ]);

      this.isActive = result.isActive || false;
      this.whitelist = result.whitelist || [];
      this.defaultRules = result.defaultRules || [];
      this.customRules = result.customRules || [];
      this.defaultRulesEnabled = result.defaultRulesEnabled !== false;
      this.customRulesEnabled = result.customRulesEnabled !== false;
      this.patternRulesEnabled = result.patternRulesEnabled !== false;
      this.navigationGuardEnabled = result.navigationGuardEnabled !== false;
      this.navigationStats = result.navigationStats || {
        blockedCount: 0,
        allowedCount: 0,
      };
      this.domainStats = {};

      console.log("OriginalUI: Settings loaded", {
        isActive: this.isActive,
        isDomainWhitelisted: this.isDomainWhitelisted(),
        rulesCount: {
          default: this.defaultRules.length,
          custom: this.customRules.length,
        },
        enabledModules: {
          defaultRules: this.defaultRulesEnabled, // EasyList bundled here
          customRules: this.customRulesEnabled,
          patternRules: this.patternRulesEnabled,
          navigationGuard: this.navigationGuardEnabled,
        },
      });
    } catch (error) {
      console.warn(
        "OriginalUI: Failed to load settings from storage:",
        error.message
      );

      // Graceful fallback: Use default settings if storage fails
      this.isActive = false; // Default to disabled for safety
      this.whitelist = [];
      this.defaultRules = [];
      this.customRules = [];
      this.defaultRulesEnabled = false;
      this.customRulesEnabled = false;
      this.patternRulesEnabled = false;
      this.navigationGuardEnabled = false;
      this.navigationStats = { blockedCount: 0, allowedCount: 0 };
      this.domainStats = {};

      console.log("OriginalUI: Using default settings due to storage error");
    }
  }

  /**
   * Setup message listeners for background script communication
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "storageChanged") {
        this.handleStorageChanges(request.changes);
      } else if (request.action === "whitelistUpdated") {
        this.whitelist = request.whitelist;
        this.invalidateWhitelistCache();
        this.executeRules();
      } else if (request.action === "executeRules") {
        this.executeRules();
        sendResponse({ success: true });
      }
    });
  }

  /**
   * Handle storage changes from background script
   */
  handleStorageChanges(changes) {
    let shouldRestart = false;
    let shouldReExecute = false;

    if (changes.isActive) {
      this.isActive = changes.isActive.newValue;
      shouldRestart = true;
    }

    if (changes.whitelist) {
      this.whitelist = changes.whitelist.newValue;
      this.invalidateWhitelistCache();
      this.navigationGuardian.updateWhitelist(this.whitelist);
      shouldRestart = true;
    }

    if (changes.navigationGuardEnabled) {
      this.navigationGuardEnabled = changes.navigationGuardEnabled.newValue;
      if (this.navigationGuardEnabled) {
        this.navigationGuardian.enable();
      } else {
        this.navigationGuardian.disable();
      }
    }

    if (changes.navigationStats) {
      this.navigationStats = changes.navigationStats.newValue;
    }

    // Handle other rule changes (EasyList is bundled with defaultRulesEnabled)
    const ruleChanges = [
      "defaultRules",
      "customRules",
      "defaultRulesEnabled",
      "customRulesEnabled",
      "patternRulesEnabled",
    ];
    ruleChanges.forEach((key) => {
      if (changes[key]) {
        this[key] = changes[key].newValue;
        shouldReExecute = true;
      }
    });

    if (shouldRestart) {
      this.startProtection();
    } else if (shouldReExecute) {
      this.executeRules();
    }
  }

  // Utility methods
  getCurrentDomain() {
    try {
      return new URL(window.location.href).hostname;
    } catch {
      return "";
    }
  }

  isDomainWhitelisted() {
    if (this.whitelistCache?.domain === this.currentDomain) {
      return this.whitelistCache.result;
    }

    const result = this.whitelist.some((domain) =>
      domainMatches(this.currentDomain, domain)
    );
    this.whitelistCache = { domain: this.currentDomain, result };
    return result;
  }

  invalidateWhitelistCache() {
    this.whitelistCache = null;
  }

  async updateDomainStats(stats) {
    // Check extension context before proceeding
    if (!isExtensionContextValid()) {
      // Use debug-level logging for expected scenario (page unload, extension reload)
      console.debug(
        "OriginalUI: Extension context invalid, skipping domain stats update"
      );
      return;
    }

    if (!this.domainStats[this.currentDomain]) {
      this.domainStats[this.currentDomain] = {
        defaultRulesRemoved: 0,
        customRulesRemoved: 0,
        easylistRulesRemoved: 0,
        easylistRulesHidden: 0,
      };
    }

    // Update session stats
    this.domainStats[this.currentDomain].defaultRulesRemoved =
      (stats.defaultRulesRemoved || 0) + (stats.patternRulesRemoved || 0);
    this.domainStats[this.currentDomain].customRulesRemoved =
      stats.customRulesRemoved || 0;
    this.domainStats[this.currentDomain].easylistRulesRemoved =
      stats.easylistRulesRemoved || 0;
    this.domainStats[this.currentDomain].easylistRulesHidden =
      stats.easylistRulesHidden || 0;

    // Store in Chrome storage using debounced safe method to reduce API calls
    try {
      // Double-check context validity before storage operation
      if (isExtensionContextValid()) {
        await debouncedStorageSet("domainStats", {
          domainStats: this.domainStats,
        });
      } else {
        console.debug(
          "OriginalUI: Extension context became invalid during stats update, skipping storage"
        );
      }
    } catch (error) {
      // Only log as warning if it's not a context invalidation error
      if (
        error.message?.includes("Extension context invalidated") ||
        !isExtensionContextValid()
      ) {
        console.debug(
          "OriginalUI: Extension context invalidated during storage operation:",
          error.message
        );
      } else {
        console.warn(
          "OriginalUI: Failed to update domain stats in storage:",
          error.message
        );
      }
      // Continue execution - stats are still updated in memory
    }
  }

  /**
   * Comprehensive cleanup destructor - prevents memory leaks
   * Uses registry pattern to follow SOLID principles with memory verification
   */
  destructor() {
    console.log("OriginalUI: Starting controller destructor...");

    // Stop all protection systems first
    this.stopProtection();

    // Use cleanup registry to clean up all modules (follows Open/Closed Principle)
    const results = this.cleanupRegistry.cleanupAll();

    // Log cleanup results for debugging
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(
      `OriginalUI: Cleanup completed - ${successful} successful, ${failed} failed`
    );

    // Clear controller state
    this.isActive = false;
    this.whitelist = [];
    this.defaultRules = [];
    this.customRules = [];
    this.domainStats = {};
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    this.whitelistCache = null;
    this.adDetectionEngine = null;

    // Clean up ElementRemover static state
    if (typeof this.constructor.ElementRemover?.cleanup === "function") {
      this.constructor.ElementRemover.cleanup();
    }

    // Clean up RuleExecutionManager
    if (
      this.ruleExecutionManager &&
      typeof this.ruleExecutionManager.cleanup === "function"
    ) {
      this.ruleExecutionManager.cleanup();
    }
    this.ruleExecutionManager = null;

    // Note: We don't null out module references since they might still be used elsewhere
    // The cleanup registry handles the actual resource cleanup

    console.log("OriginalUI: Controller destructor completed");
  }
}

// Initialize controller when DOM is ready
const originalUIController = new OriginalUIController();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    originalUIController.initialize()
  );
} else {
  originalUIController.initialize();
}

// Comprehensive lifecycle cleanup - prevents memory leaks
let isCleanedUp = false;

const performCleanup = (reason) => {
  if (isCleanedUp) return;
  isCleanedUp = true;

  console.log(`OriginalUI: Performing cleanup due to: ${reason}`);
  originalUIController.destructor();
};

// Page navigation/unload cleanup (modern approach - no deprecated 'unload' event)
window.addEventListener("beforeunload", () => performCleanup("beforeunload"));
window.addEventListener("pagehide", () => performCleanup("pagehide"));

// Visibility change cleanup (tab becomes hidden)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // Don't fully cleanup on visibility change, but ensure we can cleanup later
    console.log("OriginalUI: Page hidden, prepared for cleanup");
  }
});

// Extension context invalidation cleanup
const checkExtensionContext = () => {
  if (!isExtensionContextValid()) {
    console.debug(
      "OriginalUI: Extension context invalidated, triggering cleanup"
    );
    performCleanup("extension-context-invalidated");
  }
};

// Check extension context periodically for the first few seconds
let contextCheckCount = 0;
const contextCheckInterval = setInterval(() => {
  checkExtensionContext();
  contextCheckCount++;

  // Stop checking after 10 attempts (5 seconds)
  if (contextCheckCount >= 10 || isCleanedUp) {
    clearInterval(contextCheckInterval);
  }
}, 500);

// Chrome extension suspend/shutdown cleanup
if (chrome?.runtime?.onSuspend) {
  chrome.runtime.onSuspend.addListener(() =>
    performCleanup("extension-suspend")
  );
}

// Export for testing/debugging
window.OriginalUIController = originalUIController;
