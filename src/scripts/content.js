/**
 * JustUI Content Script - Modular Architecture
 * Main orchestrator for ad blocking and click hijacking protection
 */

// Import modules
import { ElementRemover } from './modules/ElementRemover.js';
import { ClickHijackingProtector } from './modules/ClickHijackingProtector.js';
import { SuspiciousElementDetector } from './modules/SuspiciousElementDetector.js';
import { MutationProtector } from './modules/MutationProtector.js';
import { ChromeAdTagDetector } from './modules/ChromeAdTagDetector.js';
import { SecurityProtector } from './modules/SecurityProtector.js';
import { ScriptAnalyzer } from './modules/ScriptAnalyzer.js';
import { NavigationGuardian } from './modules/NavigationGuardian.js';
import { PerformanceTracker } from './modules/PerformanceTracker.js';
import { ElementClassifier } from './modules/ElementClassifier.js';
import { SnapshotManager } from './modules/SnapshotManager.js';
import { HybridProcessor } from './modules/HybridProcessor.js';
import { CleanupRegistry } from './modules/ICleanable.js';
import { MemoryMonitor } from './modules/MemoryMonitor.js';
import { safeStorageGet, safeStorageSet, debouncedStorageSet, isExtensionContextValid } from './utils/chromeApiSafe.js';
import AdDetectionEngine from './adDetectionEngine.js';
import { PATTERN_DETECTION_CONFIG, HYBRID_CONFIG } from './constants.js';

/**
 * Main JustUI Controller - Orchestrates all protection modules
 */
class JustUIController {
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
    
    // Cleanup registry for memory leak prevention with compartments
    this.cleanupRegistry = new CleanupRegistry({
      maxCompartmentSize: 20,
      compartmentTTL: 300000, // 5 minutes
      enablePeriodicCleanup: true
    });
    
    // Memory monitoring for leak detection and verification
    this.memoryMonitor = new MemoryMonitor({
      monitoringInterval: 30000, // 30 seconds
      memoryThreshold: 50 * 1024 * 1024, // 50MB
      enablePerformanceMarking: true
    });
    this.cleanupRegistry.register(this.memoryMonitor, 'MemoryMonitor', 'monitoring');
    
    // Protection modules with compartmentalization
    this.securityProtector = new SecurityProtector();
    this.cleanupRegistry.register(this.securityProtector, 'SecurityProtector', 'protection');
    
    this.scriptAnalyzer = new ScriptAnalyzer();
    this.cleanupRegistry.register(this.scriptAnalyzer, 'ScriptAnalyzer', 'analysis');
    
    this.clickProtector = new ClickHijackingProtector();
    this.cleanupRegistry.register(this.clickProtector, 'ClickHijackingProtector', 'protection');
    
    this.navigationGuardian = new NavigationGuardian();
    this.cleanupRegistry.register(this.navigationGuardian, 'NavigationGuardian', 'protection');
    
    this.mutationProtector = new MutationProtector();
    this.cleanupRegistry.register(this.mutationProtector, 'MutationProtector', 'protection');
    
    this.chromeAdDetector = new ChromeAdTagDetector();
    this.cleanupRegistry.register(this.chromeAdDetector, 'ChromeAdTagDetector', 'detection');
    
    // Hybrid processing modules with compartmentalization
    this.elementClassifier = new ElementClassifier();
    this.cleanupRegistry.register(this.elementClassifier, 'ElementClassifier', 'analysis');
    
    this.snapshotManager = new SnapshotManager(HYBRID_CONFIG);
    this.cleanupRegistry.register(this.snapshotManager, 'SnapshotManager', 'caching');
    
    // Performance tracking (singleton to avoid repeated allocations)
    this.performanceTracker = new PerformanceTracker();
    this.cleanupRegistry.register(this.performanceTracker, 'PerformanceTracker', 'monitoring');
    
    // HybridProcessor will be initialized after AdDetectionEngine is available
    this.hybridProcessor = null;
    
    // Hybrid processing settings
    this.hybridProcessingEnabled = HYBRID_CONFIG.ADAPTIVE_DETECTION_ENABLED;
    this.bulkValidationEnabled = HYBRID_CONFIG.BULK_VALIDATION_ENABLED;
    this.fallbackToRealTime = HYBRID_CONFIG.FALLBACK_TO_REALTIME;
    
    // Navigation Guardian settings (managed by NavigationGuardian module)
    this.navigationGuardEnabled = true;
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    
    // Statistics
    this.domainStats = {};
    this.adDetectionEngine = null;
    
    console.log('JustUI: Controller initialized for domain:', this.currentDomain);
    console.log('JustUI: Registered', this.cleanupRegistry.getModuleCount(), 'cleanable modules:', this.cleanupRegistry.getModuleNames());
  }

  /**
   * Initialize the controller and all protection systems
   */
  async initialize() {
    console.log('JustUI: Initializing protection systems...');

    // 1. FIRST: Load settings to get whitelist (before any protections)
    await this.loadSettings();

    // 2. Setup message listeners ALWAYS (needed for whitelist changes from popup)
    this.setupMessageListeners();

    // 3. Initialize AdDetectionEngine
    this.adDetectionEngine = new AdDetectionEngine();
    console.log('JustUI: AdDetectionEngine initialized');
    
    // 4. Initialize HybridProcessor with AdDetectionEngine
    this.hybridProcessor = new HybridProcessor(this.adDetectionEngine, {
      criticalElementTimeout: HYBRID_CONFIG.CRITICAL_ELEMENT_TIMEOUT,
      bulkValidationEnabled: this.bulkValidationEnabled,
      fallbackToRealTime: this.fallbackToRealTime,
      adaptiveDetectionEnabled: this.hybridProcessingEnabled
    });
    this.cleanupRegistry.register(this.hybridProcessor, 'HybridProcessor', 'analysis');
    console.log('JustUI: HybridProcessor initialized');

    // 5. Check whitelist/active state BEFORE applying security protections
    if (!this.isActive || this.isDomainWhitelisted()) {
      console.log('JustUI: Skipping protections - extension inactive or domain whitelisted', {
        isActive: this.isActive,
        isDomainWhitelisted: this.isDomainWhitelisted()
      });
      return; // Exit early - no protections needed
    }

    // 6. NOW activate security protections (domain is not whitelisted & extension is active)
    this.securityProtector.activate();
    this.scriptAnalyzer.activate();

    // 7. Initialize NavigationGuardian with loaded settings
    this.navigationGuardian.initialize(this.whitelist, this.navigationStats);
    this.navigationGuardian.enable();

    // 8. Start all other protection systems
    this.startProtection();

    // 9. Start memory monitoring after all systems are initialized
    this.memoryMonitor.startMonitoring(this);

    console.log('JustUI: Initialization complete with memory monitoring');
  }

  /**
   * Start all protection systems
   */
  startProtection() {
    if (!this.isActive || this.isDomainWhitelisted()) {
      this.stopProtection();
      return;
    }

    console.log('JustUI: Starting protection systems');
    
    // Start click hijacking protection
    this.clickProtector.activate();
    
    // Set up event-driven communication between MutationProtector and ClickHijackingProtector
    this.mutationProtector.onEvent('onClickHijackingDetected', (data) => {
      if (data.action === 'scan_overlays') {
        this.clickProtector.scanAndRemoveExistingOverlays();
      }
    });
    
    // Start mutation protection with rule execution callback
    this.mutationProtector.start({
      isActive: this.isActive,
      isDomainWhitelisted: this.isDomainWhitelisted(),
      executeRulesCallback: () => this.executeRules()
    });
    
    // Start Chrome ad detection if enabled
    if (this.chromeAdTagEnabled) {
      this.chromeAdDetector.enable();
    }
    
    // Initial rule execution
    this.executeRules();
    
    // Scan for existing threats
    this.performInitialScan();
  }

  /**
   * Stop all protection systems
   */
  stopProtection() {
    console.log('JustUI: Stopping protection systems');
    
    this.securityProtector.deactivate();
    this.scriptAnalyzer.deactivate();
    this.clickProtector.deactivate();
    this.navigationGuardian.disable();
    this.mutationProtector.stop();
    this.chromeAdDetector.disable();
  }

  /**
   * Execute all enabled rule sets
   */
  async executeRules() {
    console.log('JustUI: Executing rules', {
      isActive: this.isActive,
      isDomainWhitelisted: this.isDomainWhitelisted(),
      currentDomain: this.currentDomain
    });

    if (!this.isActive || this.isDomainWhitelisted()) {
      console.log('JustUI: Skipping execution - extension inactive or domain whitelisted');
      return;
    }

    const stats = {
      defaultRulesRemoved: 0,
      customRulesRemoved: 0,
      chromeAdTagRemoved: 0,
      patternRulesRemoved: 0
    };

    // Execute default rules
    if (this.defaultRulesEnabled) {
      stats.defaultRulesRemoved = await this.executeDefaultRules();
    }

    // Execute custom rules  
    if (this.customRulesEnabled) {
      stats.customRulesRemoved = await this.executeCustomRules();
    }

    // Execute Chrome ad tag detection
    if (this.chromeAdTagEnabled) {
      stats.chromeAdTagRemoved = await this.executeChromeAdTagRules();
    }

    // Execute pattern-based detection
    if (this.patternRulesEnabled && this.adDetectionEngine) {
      stats.patternRulesRemoved = await this.executePatternRules();
    }

    // Update statistics
    await this.updateDomainStats(stats);

    const totalRemoved = Object.values(stats).reduce((sum, count) => sum + count, 0);
    if (totalRemoved > 0) {
      console.log(`JustUI: Total elements removed: ${totalRemoved}`, stats);
    }
  }

  /**
   * Execute default CSS selector rules
   */
  async executeDefaultRules() {
    const enabledRules = this.defaultRules.filter(rule => rule.enabled);
    let removedCount = 0;

    for (const rule of enabledRules) {
      if (!this.ruleAppliesTo(rule, this.currentDomain)) continue;

      try {
        const elements = document.querySelectorAll(rule.selector);
        const removed = ElementRemover.batchRemove(
          Array.from(elements), 
          rule.id, 
          ElementRemover.REMOVAL_STRATEGIES.REMOVE
        );
        
        removedCount += removed;
        
        if (removed > 0) {
          console.log(`JustUI: Default rule "${rule.description}" removed ${removed} elements`);
        }
      } catch (error) {
        console.error(`JustUI: Error executing default rule "${rule.id}":`, error);
      }
    }

    return removedCount;
  }

  /**
   * Execute custom user-defined rules
   */
  async executeCustomRules() {
    const enabledRules = this.customRules.filter(rule => rule.enabled);
    let removedCount = 0;

    for (const rule of enabledRules) {
      if (!this.ruleAppliesTo(rule, this.currentDomain)) continue;

      try {
        const elements = document.querySelectorAll(rule.selector);
        const removed = ElementRemover.batchRemove(
          Array.from(elements), 
          rule.id, 
          ElementRemover.REMOVAL_STRATEGIES.REMOVE
        );
        
        removedCount += removed;
        
        if (removed > 0) {
          console.log(`JustUI: Custom rule "${rule.description}" removed ${removed} elements`);
        }
      } catch (error) {
        console.error(`JustUI: Error executing custom rule "${rule.id}":`, error);
      }
    }

    return removedCount;
  }

  /**
   * Execute Chrome ad tag detection rules
   */
  async executeChromeAdTagRules() {
    if (!this.chromeAdDetector.isEnabled) return 0;

    const detectedElements = this.chromeAdDetector.scanForChromeAdElements();
    let removedCount = 0;

    detectedElements.forEach(({ element, type, confidence }) => {
      if (ElementRemover.removeElement(element, `chrome-${type}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
        removedCount++;
        console.log(`JustUI: Chrome ad tag removed (${type}, confidence: ${Math.round(confidence * 100)}%)`, {
          element: element.tagName,
          src: element.src
        });
      }
    });

    return removedCount;
  }

  /**
   * Execute pattern-based detection rules using Hybrid Processing Strategy
   * Combines bulk optimization with real-time processing for critical elements
   */
  async executePatternRules() {
    if (!this.adDetectionEngine || !this.hybridProcessor) {
      console.warn('JustUI: AdDetectionEngine or HybridProcessor not available, skipping pattern rules');
      return 0;
    }

    // Check if hybrid processing is enabled
    if (!this.hybridProcessingEnabled) {
      return this._executePatternRulesLegacy();
    }

    const suspiciousElements = document.querySelectorAll('div, iframe, section, aside, nav, header');
    if (suspiciousElements.length === 0) return 0;

    const startTime = performance.now();
    console.log(`JustUI: Hybrid pattern detection starting - ${suspiciousElements.length} elements`);

    // Reset performance tracker state to prevent contamination between cycles
    this.performanceTracker.reset();

    try {
      // Execute hybrid strategy with all required dependencies
      const removedCount = await this.hybridProcessor.executeHybridStrategy(suspiciousElements, {
        elementClassifier: this.elementClassifier,
        snapshotManager: this.snapshotManager,
        perfTracker: this.performanceTracker // Use singleton instance
      });

      const totalTime = performance.now() - startTime;
      console.log(`JustUI: Hybrid pattern detection completed - ${removedCount} elements removed in ${Math.round(totalTime)}ms`);

      // Log hybrid performance summary
      const hybridStats = this.hybridProcessor.getStats();
      const perfStats = this.performanceTracker.getHybridSummary();
      
      console.log('JustUI: Hybrid Performance Summary:', {
        processing: {
          totalElements: suspiciousElements.length,
          criticalElements: hybridStats.criticalProcessed,
          bulkElements: hybridStats.bulkProcessed,
          criticalRatio: hybridStats.processingRatio
        },
        efficiency: {
          totalRemoved: removedCount,
          removalRate: hybridStats.removalEfficiency,
          fallbackRate: hybridStats.errorRate,
          processingTime: `${Math.round(totalTime)}ms`
        }
      });

      return removedCount;

    } catch (error) {
      console.error('JustUI: Error in hybrid pattern detection:', error);
      
      // Fallback to legacy processing if enabled
      if (this.fallbackToRealTime) {
        console.warn('JustUI: Falling back to legacy pattern detection');
        return this._executePatternRulesLegacy();
      }
      
      return 0;
    }
  }

  /**
   * Legacy pattern detection implementation (fallback)
   * Maintains the previous optimized READ-write separation approach
   */
  async _executePatternRulesLegacy() {
    console.log('JustUI: Executing legacy pattern detection');
    
    if (!this.adDetectionEngine) return 0;

    let removedCount = 0;
    const suspiciousElements = document.querySelectorAll('div, iframe, section, aside, nav, header');

    if (suspiciousElements.length === 0) return 0;

    // Use simplified sequential processing as fallback
    for (const element of suspiciousElements) {
      try {
        if (!element.isConnected || ElementRemover.isProcessed(element)) continue;

        const analysis = await this.adDetectionEngine.analyze(element);
        
        if (analysis.isAd && analysis.confidence > 0.7) {
          element.setAttribute('data-justui-confidence', Math.round(analysis.confidence * 100));
          element.setAttribute('data-justui-rules', analysis.matchedRules.map(r => r.rule).join(','));
          
          if (ElementRemover.removeElement(element, `legacy-${analysis.totalScore}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
            removedCount++;
          }
        }
      } catch (error) {
        console.error('JustUI: Error in legacy pattern analysis:', error);
      }
    }

    return removedCount;
  }



  /**
   * Yield control to the main thread using cooperative scheduling
   */
  async yieldToMainThread() {
    return new Promise(resolve => {
      if ('requestIdleCallback' in window) {
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
    console.log('JustUI: Performing initial threat scan');
    
    // Scan for click hijacking overlays
    const removedOverlays = this.clickProtector.scanAndRemoveExistingOverlays();
    
    // Get script analysis statistics
    const scriptStats = this.scriptAnalyzer.getStats();
    
    // Scan for Chrome ad elements
    if (this.chromeAdDetector.isEnabled) {
      const chromeAds = this.chromeAdDetector.scanForChromeAdElements();
      console.log(`JustUI: Initial scan found ${chromeAds.length} Chrome ad elements`);
    }
    
    console.log(`JustUI: Initial scan complete. Removed ${removedOverlays} suspicious overlays, blocked ${scriptStats.blockedScriptsCount} scripts`);
  }

  /**
   * Load settings from Chrome storage
   */
  async loadSettings() {
    try {
      const result = await safeStorageGet([
        'isActive',
        'whitelist', 
        'defaultRules',
        'customRules',
        'defaultRulesEnabled',
        'customRulesEnabled',
        'patternRulesEnabled',
        'chromeAdTagEnabled',
        'navigationGuardEnabled',
        'navigationStats'
      ]);

      this.isActive = result.isActive || false;
      this.whitelist = result.whitelist || [];
      this.defaultRules = result.defaultRules || [];
      this.customRules = result.customRules || [];
      this.defaultRulesEnabled = result.defaultRulesEnabled !== false;
      this.customRulesEnabled = result.customRulesEnabled !== false;
      this.patternRulesEnabled = result.patternRulesEnabled !== false;
      this.chromeAdTagEnabled = result.chromeAdTagEnabled !== false;
      this.navigationGuardEnabled = result.navigationGuardEnabled !== false;
      this.navigationStats = result.navigationStats || { blockedCount: 0, allowedCount: 0 };
      this.domainStats = {};

      console.log('JustUI: Settings loaded', {
        isActive: this.isActive,
        isDomainWhitelisted: this.isDomainWhitelisted(),
        rulesCount: {
          default: this.defaultRules.length,
          custom: this.customRules.length
        },
        enabledModules: {
          defaultRules: this.defaultRulesEnabled,
          customRules: this.customRulesEnabled,
          patternRules: this.patternRulesEnabled,
          chromeAdTag: this.chromeAdTagEnabled,
          navigationGuard: this.navigationGuardEnabled
        }
      });

    } catch (error) {
      console.warn('JustUI: Failed to load settings from storage:', error.message);
      
      // Graceful fallback: Use default settings if storage fails
      this.isActive = false; // Default to disabled for safety
      this.whitelist = [];
      this.defaultRules = [];
      this.customRules = [];
      this.defaultRulesEnabled = false;
      this.customRulesEnabled = false;
      this.patternRulesEnabled = false;
      this.chromeAdTagEnabled = false;
      this.navigationGuardEnabled = false;
      this.navigationStats = { blockedCount: 0, allowedCount: 0 };
      this.domainStats = {};

      console.log('JustUI: Using default settings due to storage error');
    }
  }

  /**
   * Setup message listeners for background script communication
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'storageChanged') {
        this.handleStorageChanges(request.changes);
      } else if (request.action === 'whitelistUpdated') {
        this.whitelist = request.whitelist;
        this.invalidateWhitelistCache();
        this.executeRules();
      } else if (request.action === 'executeRules') {
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

    if (changes.chromeAdTagEnabled) {
      this.chromeAdTagEnabled = changes.chromeAdTagEnabled.newValue;
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

    // Handle other rule changes
    const ruleChanges = ['defaultRules', 'customRules', 'defaultRulesEnabled', 'customRulesEnabled', 'patternRulesEnabled'];
    ruleChanges.forEach(key => {
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
      return '';
    }
  }

  isDomainWhitelisted() {
    if (this.whitelistCache?.domain === this.currentDomain) {
      return this.whitelistCache.result;
    }

    const result = this.whitelist.some(domain => this.domainMatches(this.currentDomain, domain));
    this.whitelistCache = { domain: this.currentDomain, result };
    return result;
  }

  domainMatches(domain, pattern) {
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return domain === baseDomain || domain.endsWith('.' + baseDomain);
    }
    return domain === pattern || domain.endsWith('.' + pattern);
  }

  ruleAppliesTo(rule, domain) {
    if (!rule.domains?.length) return false;
    if (rule.domains.includes('*')) return true;
    return rule.domains.some(ruleDomain => this.domainMatches(domain, ruleDomain));
  }

  invalidateWhitelistCache() {
    this.whitelistCache = null;
  }

  async updateDomainStats(stats) {
    // Check extension context before proceeding
    if (!isExtensionContextValid()) {
      // Use debug-level logging for expected scenario (page unload, extension reload)
      console.debug('JustUI: Extension context invalid, skipping domain stats update');
      return;
    }

    if (!this.domainStats[this.currentDomain]) {
      this.domainStats[this.currentDomain] = {
        defaultRulesRemoved: 0,
        customRulesRemoved: 0,
        chromeAdTagRemoved: 0
      };
    }

    // Update session stats
    this.domainStats[this.currentDomain].defaultRulesRemoved = stats.defaultRulesRemoved + stats.patternRulesRemoved;
    this.domainStats[this.currentDomain].customRulesRemoved = stats.customRulesRemoved;
    this.domainStats[this.currentDomain].chromeAdTagRemoved = stats.chromeAdTagRemoved;

    // Store in Chrome storage using debounced safe method to reduce API calls
    try {
      // Double-check context validity before storage operation
      if (isExtensionContextValid()) {
        await debouncedStorageSet('domainStats', { domainStats: this.domainStats });
      } else {
        console.debug('JustUI: Extension context became invalid during stats update, skipping storage');
      }
    } catch (error) {
      // Only log as warning if it's not a context invalidation error
      if (error.message?.includes('Extension context invalidated') || !isExtensionContextValid()) {
        console.debug('JustUI: Extension context invalidated during storage operation:', error.message);
      } else {
        console.warn('JustUI: Failed to update domain stats in storage:', error.message);
      }
      // Continue execution - stats are still updated in memory
    }
  }

  /**
   * Comprehensive cleanup destructor - prevents memory leaks
   * Uses registry pattern to follow SOLID principles with memory verification
   */
  destructor() {
    console.log('JustUI: Starting controller destructor...');
    
    // Take pre-cleanup memory snapshot
    const beforeSnapshot = this.memoryMonitor.takeMemorySnapshot('cleanup');
    
    // Stop all protection systems first
    this.stopProtection();
    
    // Use cleanup registry to clean up all modules (follows Open/Closed Principle)
    const results = this.cleanupRegistry.cleanupAll();
    
    // Take post-cleanup memory snapshot and verify effectiveness
    const afterSnapshot = this.memoryMonitor.takeMemorySnapshot('cleanup');
    const verificationResults = this.memoryMonitor.verifyCleanupEffectiveness(beforeSnapshot, afterSnapshot);
    
    // Force garbage collection to maximize cleanup effectiveness
    this.memoryMonitor.forceGarbageCollection();
    
    // Log cleanup results for debugging
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`JustUI: Cleanup completed - ${successful} successful, ${failed} failed`);
    
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
    if (typeof this.constructor.ElementRemover?.cleanup === 'function') {
      this.constructor.ElementRemover.cleanup();
    }
    
    // Note: We don't null out module references since they might still be used elsewhere
    // The cleanup registry handles the actual resource cleanup
    
    // Log final memory report
    const memoryReport = this.memoryMonitor.getMemoryReport();
    console.log('JustUI: Final memory report:', {
      verificationResults,
      recommendations: memoryReport.recommendations,
      memoryHistory: memoryReport.history.length
    });
    
    console.log('JustUI: Controller destructor completed with verification');
  }
}

// Initialize controller when DOM is ready
const justUIController = new JustUIController();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => justUIController.initialize());
} else {
  justUIController.initialize();
}

// Comprehensive lifecycle cleanup - prevents memory leaks
let isCleanedUp = false;

const performCleanup = (reason) => {
  if (isCleanedUp) return;
  isCleanedUp = true;
  
  console.log(`JustUI: Performing cleanup due to: ${reason}`);
  justUIController.destructor();
};

// Page navigation/unload cleanup (modern approach - no deprecated 'unload' event)
window.addEventListener('beforeunload', () => performCleanup('beforeunload'));
window.addEventListener('pagehide', () => performCleanup('pagehide'));

// Visibility change cleanup (tab becomes hidden)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Don't fully cleanup on visibility change, but ensure we can cleanup later
    console.log('JustUI: Page hidden, prepared for cleanup');
  }
});

// Extension context invalidation cleanup
const checkExtensionContext = () => {
  if (!isExtensionContextValid()) {
    console.debug('JustUI: Extension context invalidated, triggering cleanup');
    performCleanup('extension-context-invalidated');
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
  chrome.runtime.onSuspend.addListener(() => performCleanup('extension-suspend'));
}

// Export for testing/debugging
window.JustUIController = justUIController;