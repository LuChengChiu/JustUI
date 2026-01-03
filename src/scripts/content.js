/**
 * OriginalUI Content Script - Modular Architecture
 * Main orchestrator for ad blocking and click hijacking protection
 */

// Import modules
import Logger from '@script-utils/logger.js';
import { domainMatches } from "@utils/url-utils.js";
import { ClickHijackingProtector } from "./modules/click-hijacking-protector.js";
import { ElementRemover } from "./modules/element-remover.js";
import { CleanupRegistry } from "./modules/cleanup-registry.js";
import { NavigationGuardian } from "./modules/navigation-guardian/navigation-guardian.js";
import { createRuleExecutionSystem } from "./modules/rule-execution/config/sources.config.js";
import {
  debouncedStorageSet,
  isExtensionContextValid,
  safeStorageGet,
} from "./utils/chrome-api-safe.js";

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

    // Cleanup registry for memory leak prevention
    this.cleanupRegistry = new CleanupRegistry();

    // Protection modules
    // Note: Script analysis now handled by injected-script.js with MaliciousPatternDetector

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

    // Rule execution system (initialized in initialize())
    this.ruleExecutionManager = null;

    Logger.info('ControllerInit', 'Controller initialized', {
      domain: this.currentDomain,
      cleanableModules: this.cleanupRegistry.getModuleCount(),
      moduleNames: this.cleanupRegistry.getModuleNames()
    });
  }

  /**
   * Initialize the controller and all protection systems
   */
  async initialize() {
    Logger.info('InitStart', 'Initializing protection systems');

    // 1. FIRST: Load settings to get whitelist (before any protections)
    await this.loadSettings();

    // 2. Setup message listeners ALWAYS (needed for whitelist changes from popup)
    this.setupMessageListeners();

    // 3. Initialize Rule Execution System
    this.ruleExecutionManager = await createRuleExecutionSystem();
    Logger.info('RuleSystemInit', 'Rule Execution System initialized');

    // 4. Check whitelist/active state BEFORE applying security protections
    if (!this.isActive || this.isDomainWhitelisted()) {
      Logger.info('ProtectionsSkipped', 'Skipping protections - inactive or whitelisted', {
        isActive: this.isActive,
        isDomainWhitelisted: this.isDomainWhitelisted(),
      });
      return; // Exit early - no protections needed
    }

    // 5. NOW activate security protections (domain is not whitelisted & extension is active)
    // Note: Script analysis is handled by injected-script.js (runs earlier in page lifecycle)

    // 6. Initialize NavigationGuardian with loaded settings
    this.navigationGuardian.initialize(this.whitelist, this.navigationStats);
    this.navigationGuardian.enable();

    // 7. Start all other protection systems
    this.startProtection();

    Logger.info('InitComplete', 'Initialization complete');
  }

  /**
   * Start all protection systems
   */
  startProtection() {
    if (!this.isActive || this.isDomainWhitelisted()) {
      this.stopProtection();
      return;
    }

    Logger.info('ProtectionStart', 'Starting protection systems');

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
    Logger.info('ProtectionStop', 'Stopping protection systems');

    this.clickProtector.deactivate();
    this.navigationGuardian.disable();
  }

  /**
   * Execute all enabled rule sets
   */
  async executeRules() {
    Logger.debug('ExecuteRules', 'Executing rules', {
      isActive: this.isActive,
      isDomainWhitelisted: this.isDomainWhitelisted(),
      currentDomain: this.currentDomain,
    });

    if (!this.isActive || this.isDomainWhitelisted()) {
      Logger.info('ExecutionSkipped', 'Skipping execution - inactive or whitelisted');
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

    // Update statistics
    await this.updateDomainStats(stats);

    const totalRemoved = Object.values(stats).reduce(
      (sum, count) => sum + (typeof count === "number" ? count : 0),
      0
    );
    if (totalRemoved > 0) {
      Logger.info('ElementsRemoved', 'Total elements removed', { totalRemoved, stats });
    }
  }

  // NOTE: executeDefaultRules() and executeCustomRules() have been removed
  // They are now handled by RuleExecutionManager in rule-execution module
  // See: src/scripts/modules/rule-execution/

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
    Logger.info('InitialScan', 'Performing initial threat scan');

    // Scan for click hijacking overlays
    const removedOverlays = this.clickProtector.scanAndRemoveExistingOverlays();

    // Note: Script blocking stats are now reported via NAV_GUARDIAN_STATS message from injected-script.js
    Logger.info('InitialScanComplete', 'Initial scan complete', { removedOverlays });
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
        "navigationGuardEnabled",
        "navigationStats",
      ]);

      this.isActive = result.isActive || false;
      this.whitelist = result.whitelist || [];
      this.defaultRules = result.defaultRules || [];
      this.customRules = result.customRules || [];
      this.defaultRulesEnabled = result.defaultRulesEnabled !== false;
      this.customRulesEnabled = result.customRulesEnabled !== false;
      this.navigationGuardEnabled = result.navigationGuardEnabled !== false;
      this.navigationStats = result.navigationStats || {
        blockedCount: 0,
        allowedCount: 0,
      };
      this.domainStats = {};

      Logger.info('SettingsLoaded', 'Settings loaded', {
        isActive: this.isActive,
        isDomainWhitelisted: this.isDomainWhitelisted(),
        rulesCount: {
          default: this.defaultRules.length,
          custom: this.customRules.length,
        },
        enabledModules: {
          defaultRules: this.defaultRulesEnabled, // EasyList bundled here
          customRules: this.customRulesEnabled,
          navigationGuard: this.navigationGuardEnabled,
        },
      });
    } catch (error) {
      Logger.warn('SettingsLoadFailed', 'Failed to load settings from storage', {
        error: error.message
      });

      // Graceful fallback: Use default settings if storage fails
      this.isActive = false; // Default to disabled for safety
      this.whitelist = [];
      this.defaultRules = [];
      this.customRules = [];
      this.defaultRulesEnabled = false;
      this.customRulesEnabled = false;
      this.navigationGuardEnabled = false;
      this.navigationStats = { blockedCount: 0, allowedCount: 0 };
      this.domainStats = {};

      Logger.warn('DefaultSettings', 'Using default settings due to storage error');
    }
  }

  /**
   * Setup message listeners for background script communication
   */
  setupMessageListeners() {
    // Listen directly to Chrome storage changes (no tabs permission needed)
    // This replaces the background script broadcast approach
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        this.handleStorageChanges(changes);
      }
    });

    // Keep message listener for direct action requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!chrome?.runtime?.id) {
        return false;
      }

      if (sender?.id && sender.id !== chrome.runtime.id) {
        return false;
      }

      // Direct action requests (not handled by storage events)
      if (request.action === "executeRules") {
        this.executeRules();
        sendResponse({ success: true });
      }
    });

  }

  /**
   * Handle storage changes from Chrome's native storage API
   * This method is called when any chrome.storage.local change occurs
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

    // Pop-under protection toggle
    if (changes.popUnderProtectionEnabled) {
      const enabled = changes.popUnderProtectionEnabled.newValue;
      if (enabled) {
        this.clickProtector.activate();
      } else {
        this.clickProtector.deactivate();
      }
    }

    // Script analysis toggle (handled by injected-script.js)
    // Note: injected-script.js loads early and doesn't dynamically toggle
    // May require page reload for this setting to take effect
    if (changes.scriptAnalysisEnabled) {
      Logger.info('ScriptAnalysisToggle', 'Script analysis setting changed (may require reload)', {
        enabled: changes.scriptAnalysisEnabled.newValue
      });
    }

    // Handle other rule changes (EasyList is bundled with defaultRulesEnabled)
    const ruleChanges = [
      "defaultRules",
      "customRules",
      "defaultRulesEnabled",
      "customRulesEnabled",
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
      stats.defaultRulesRemoved || 0;
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
        Logger.warn('StatsUpdateFailed', 'Failed to update domain stats in storage', {
          error: error.message
        });
      }
      // Continue execution - stats are still updated in memory
    }
  }

  /**
   * Comprehensive cleanup destructor - prevents memory leaks
   * Uses registry pattern to follow SOLID principles with memory verification
   */
  async destructor() {
    Logger.info('DestructorStart', 'Starting controller destructor');

    // Stop all protection systems first
    this.stopProtection();

    // Use cleanup registry to clean up all modules (follows Open/Closed Principle)
    // CRITICAL FIX: Await cleanupAll() to ensure all modules finish cleanup before proceeding
    const results = await this.cleanupRegistry.cleanupAll();

    // Log cleanup results for debugging
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    Logger.info('CleanupComplete', 'Cleanup completed', { successful, failed });

    // Clear controller state
    this.isActive = false;
    this.whitelist = [];
    this.defaultRules = [];
    this.customRules = [];
    this.domainStats = {};
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    this.whitelistCache = null;

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

    Logger.info('DestructorComplete', 'Controller destructor completed');
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

const performCleanup = async (reason) => {
  if (isCleanedUp) return;
  isCleanedUp = true;

  Logger.info('PerformCleanup', 'Performing cleanup', { reason });
  await originalUIController.destructor();
};

// Page navigation/unload cleanup (modern approach - no deprecated 'unload' event)
window.addEventListener("beforeunload", () => performCleanup("beforeunload"));
window.addEventListener("pagehide", () => performCleanup("pagehide"));

// Visibility change cleanup (tab becomes hidden)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // Don't fully cleanup on visibility change, but ensure we can cleanup later
    Logger.debug('PageHidden', 'Page hidden, prepared for cleanup');
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
