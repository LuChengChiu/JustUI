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
import { safeStorageGet, safeStorageSet, debouncedStorageSet, isExtensionContextValid } from './utils/chromeApiSafe.js';

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
    
    // Protection modules
    this.securityProtector = new SecurityProtector();
    this.scriptAnalyzer = new ScriptAnalyzer();
    this.clickProtector = new ClickHijackingProtector();
    this.navigationGuardian = new NavigationGuardian();
    this.mutationProtector = new MutationProtector(this.clickProtector);
    this.chromeAdDetector = new ChromeAdTagDetector();
    
    // Navigation Guardian settings (managed by NavigationGuardian module)
    this.navigationGuardEnabled = true;
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    
    // Statistics
    this.domainStats = {};
    this.adDetectionEngine = null;
    
    console.log('JustUI: Controller initialized for domain:', this.currentDomain);
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

    // 3. Initialize AdDetectionEngine if available
    if (typeof AdDetectionEngine !== 'undefined') {
      this.adDetectionEngine = new AdDetectionEngine();
      console.log('JustUI: AdDetectionEngine initialized');
    }

    // 4. Check whitelist/active state BEFORE applying security protections
    if (!this.isActive || this.isDomainWhitelisted()) {
      console.log('JustUI: Skipping protections - extension inactive or domain whitelisted', {
        isActive: this.isActive,
        isDomainWhitelisted: this.isDomainWhitelisted()
      });
      return; // Exit early - no protections needed
    }

    // 5. NOW activate security protections (domain is not whitelisted & extension is active)
    this.securityProtector.activate();
    this.scriptAnalyzer.activate();

    // 6. Initialize NavigationGuardian with loaded settings
    this.navigationGuardian.initialize(this.whitelist, this.navigationStats);
    this.navigationGuardian.enable();

    // 7. Start all other protection systems
    this.startProtection();

    console.log('JustUI: Initialization complete');
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
   * Execute pattern-based detection rules
   */
  async executePatternRules() {
    if (!this.adDetectionEngine) return 0;

    let removedCount = 0;
    const suspiciousElements = document.querySelectorAll('div, iframe, section, aside, nav, header');

    for (const element of suspiciousElements) {
      if (ElementRemover.isProcessed(element)) continue;

      try {
        const analysis = await this.adDetectionEngine.analyze(element);
        
        if (analysis.isAd && analysis.confidence > 0.7) {
          element.setAttribute('data-justui-confidence', Math.round(analysis.confidence * 100));
          element.setAttribute('data-justui-rules', analysis.matchedRules.map(r => r.rule).join(','));
          
          if (ElementRemover.removeElement(element, `pattern-${analysis.totalScore}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
            removedCount++;
            console.log(`JustUI: Pattern detection removed element (score: ${analysis.totalScore}, confidence: ${Math.round(analysis.confidence * 100)}%)`, {
              rules: analysis.matchedRules,
              element: element.tagName + (element.className ? `.${element.className}` : '')
            });
          }
        }
      } catch (error) {
        console.error('JustUI: Error in pattern analysis:', error);
      }
    }

    return removedCount;
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
      console.warn('JustUI: Extension context invalid, skipping domain stats update');
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
      await debouncedStorageSet('domainStats', { domainStats: this.domainStats });
    } catch (error) {
      console.warn('JustUI: Failed to update domain stats in storage:', error.message);
      // Continue execution - stats are still updated in memory
    }
  }
}

// Initialize controller when DOM is ready
const justUIController = new JustUIController();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => justUIController.initialize());
} else {
  justUIController.initialize();
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  justUIController.stopProtection();
});

// Export for testing/debugging
window.JustUIController = justUIController;