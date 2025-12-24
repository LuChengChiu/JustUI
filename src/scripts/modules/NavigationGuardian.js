/**
 * NavigationGuardian Module - Comprehensive cross-origin navigation protection
 * 
 * @fileoverview Provides multi-layered protection against malicious navigation attempts including
 * pop-unders, redirects, and cross-origin attacks. Features intelligent modal confirmation system,
 * whitelist management, and comprehensive statistics tracking with memory leak prevention.
 * 
 * @example
 * // Basic initialization
 * const guardian = new NavigationGuardian();
 * guardian.initialize(['trusted-site.com'], { blockedCount: 0, allowedCount: 0 });
 * 
 * @example
 * // Enable/disable protection
 * guardian.setEnabled(false); // Temporarily disable
 * guardian.setEnabled(true);  // Re-enable protection
 * 
 * @example
 * // Access statistics and cleanup
 * const stats = guardian.getNavigationStats();
 * console.log(`Blocked: ${stats.blockedCount}, Allowed: ${stats.allowedCount}`);
 * guardian.cleanup(); // Clean up resources
 * 
 * @module NavigationGuardian
 * @extends CleanableModule
 * @since 1.0.0
 * @author JustUI Team
 */

import { MAX_Z_INDEX } from '../constants.js';
import { LIFECYCLE_PHASES, CleanableModule } from './ICleanable.js';

/**
 * NavigationGuardian class providing comprehensive cross-origin navigation protection
 * @extends CleanableModule
 * @class
 */
export class NavigationGuardian extends CleanableModule {
  /**
   * Create a NavigationGuardian instance
   * @constructor
   */
  constructor() {
    super();
    
    /**
     * Enable/disable state for navigation protection
     * @type {boolean}
     * @private
     */
    this.isEnabled = true;
    
    /**
     * Navigation attempt statistics
     * @type {Object}
     * @property {number} blockedCount - Total blocked navigation attempts
     * @property {number} allowedCount - Total allowed navigation attempts
     * @private
     */
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    
    /**
     * WeakMap for automatic garbage collection of pending modals
     * @type {WeakMap<Object, Object>}
     * @private
     */
    this.pendingNavigationModals = new WeakMap(); // Use WeakMap for auto GC
    
    /**
     * Map for string-keyed modal tracking with size limits
     * @type {Map<string, Object>}
     * @private
     */
    this.pendingModalKeys = new Map(); // Separate storage for string keys with limits
    
    /**
     * Array of whitelisted domains that bypass navigation protection
     * @type {string[]}
     * @private
     */
    this.whitelist = [];
    
    /**
     * Cached whitelist lookup for performance optimization
     * @type {Set<string>|null}
     * @private
     */
    this.whitelistCache = null;
    
    /**
     * Registered event listeners for cleanup tracking
     * @type {Array<Object>}
     * @private
     */
    this.eventListeners = [];
    
    /**
     * Enhanced modal cache management configuration
     * @type {Object}
     * @property {number} maxModalCache - Maximum pending modals (50)
     * @property {number} modalCacheTimeout - Modal timeout in ms (30s)
     * @property {number|null} modalCleanupTimer - Cleanup timer ID
     * @property {Object} modalCacheStats - Cache statistics
     * @private
     */
    this.maxModalCache = 50; // Limit pending modals to prevent memory bloat
    this.modalCacheTimeout = 30000; // 30 second timeout for pending modals
    this.modalCleanupTimer = null;
    this.modalCacheStats = {
      totalCreated: 0,
      totalCleaned: 0,
      currentPending: 0,
      maxPendingReached: 0
    };
    
    console.log('JustUI: NavigationGuardian initialized with enhanced cleanup');
  }

  /**
   * Initialize NavigationGuardian with whitelist and settings
   * @param {string[]} [whitelist=[]] - Array of trusted domains that bypass protection
   * @param {Object} [stats={blockedCount: 0, allowedCount: 0}] - Existing navigation statistics
   * @param {number} stats.blockedCount - Number of previously blocked navigation attempts
   * @param {number} stats.allowedCount - Number of previously allowed navigation attempts
   * @throws {Error} If whitelist is not an array or stats is not an object
   * 
   * @example
   * // Initialize with trusted domains and existing stats
   * guardian.initialize(['google.com', 'github.com'], { blockedCount: 5, allowedCount: 10 });
   */
  initialize(whitelist = [], stats = { blockedCount: 0, allowedCount: 0 }) {
    this.setLifecyclePhase(LIFECYCLE_PHASES.INITIALIZING);
    
    this.whitelist = whitelist;
    this.navigationStats = stats;
    this.setupEventListeners();
    this.injectNavigationScript();
    this.startModalCacheCleanup();
    
    this.setLifecyclePhase(LIFECYCLE_PHASES.ACTIVE);
    console.log('JustUI: NavigationGuardian initialized with whitelist:', whitelist.length);
  }

  /**
   * Enable NavigationGuardian protection
   */
  enable() {
    this.isEnabled = true;
    console.log('JustUI: NavigationGuardian enabled');
  }

  /**
   * Disable NavigationGuardian protection
   */
  disable() {
    this.isEnabled = false;
    console.log('JustUI: NavigationGuardian disabled');
  }

  /**
   * Setup event listeners for navigation interception
   */
  setupEventListeners() {
    // Listen for link clicks (capture phase to intercept early)
    const clickHandler = this.handleLinkClick.bind(this);
    const submitHandler = this.handleFormSubmit.bind(this);
    const messageHandler = this.handleNavigationMessage.bind(this);
    
    document.addEventListener('click', clickHandler, true);
    this.eventListeners.push({
      element: document,
      type: 'click',
      handler: clickHandler,
      options: true
    });
    
    // Listen for form submissions (capture phase)
    document.addEventListener('submit', submitHandler, true);
    this.eventListeners.push({
      element: document,
      type: 'submit', 
      handler: submitHandler,
      options: true
    });
    
    // Listen for messages from injected script
    window.addEventListener('message', messageHandler);
    this.eventListeners.push({
      element: window,
      type: 'message',
      handler: messageHandler,
      options: undefined
    });
    
    console.log('JustUI: Navigation Guardian listeners setup complete');
  }

  /**
   * Handle link clicks and check for cross-origin navigation
   * @param {Event} event - Click event
   */
  handleLinkClick(event) {
    if (!this.isEnabled || this.isDomainWhitelisted(this.getCurrentDomain())) {
      return;
    }
    
    const link = event.target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!href || !this.isCrossOrigin(href)) return;
    
    // Skip if target domain is whitelisted
    if (this.isNavigationTrusted(href)) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    this.showNavigationModal(href, (allowed) => {
      if (allowed) {
        if (link.target === '_blank') {
          window.open(href, '_blank');
        } else {
          window.location.href = href;
        }
      }
    });
  }

  /**
   * Handle form submissions and check for cross-origin actions
   * @param {Event} event - Submit event
   */
  handleFormSubmit(event) {
    if (!this.isEnabled || this.isDomainWhitelisted(this.getCurrentDomain())) {
      return;
    }
    
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    
    const action = form.getAttribute('action') || window.location.href;
    if (!this.isCrossOrigin(action)) return;
    
    // Skip if target domain is whitelisted
    if (this.isNavigationTrusted(action)) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    this.showNavigationModal(action, (allowed) => {
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

  /**
   * Handle messages from injected navigation script
   * @param {Event} event - Message event
   */
  handleNavigationMessage(event) {
    if (event.source !== window) return;
    
    if (event.data?.type === 'NAV_GUARDIAN_CHECK') {
      const { url, messageId, popUnderAnalysis } = event.data;
      
      // If this messageId is already being processed, ignore duplicate
      if (this.pendingModalKeys.has(messageId)) {
        console.debug('JustUI: Ignoring duplicate navigation request:', messageId);
        return;
      }
      
      let allowed = true;
      
      // Skip navigation protection if current domain is whitelisted
      if (this.isDomainWhitelisted(this.getCurrentDomain())) {
        // Send immediate response for allowed navigation from whitelisted domain
        window.postMessage({
          type: 'NAV_GUARDIAN_RESPONSE',
          messageId: messageId,
          allowed: true
        }, '*');
        return;
      }
      
      if (this.isEnabled && this.isCrossOrigin(url) && !this.isNavigationTrusted(url)) {
        // Analyze URL for threats
        const urlAnalysis = this.analyzeURLThreats(url);
        
        // Combine pop-under analysis from injected script with URL analysis
        const combinedAnalysis = {
          riskScore: (popUnderAnalysis?.score || 0) + urlAnalysis.riskScore,
          threats: [...(popUnderAnalysis?.threats || []), ...urlAnalysis.threats],
          isPopUnder: (popUnderAnalysis?.isPopUnder || false) || urlAnalysis.isPopUnder
        };
        
        // Track this modal to prevent duplicates
        // Enforce cache limits before adding new entry
        this.enforcePendingModalLimits();
        this.pendingModalKeys.set(messageId, {
          timestamp: Date.now(),
          url: url,
          analysis: combinedAnalysis
        });
        this.modalCacheStats.totalCreated++;
        this.modalCacheStats.currentPending++;
        
        if (this.modalCacheStats.currentPending > this.modalCacheStats.maxPendingReached) {
          this.modalCacheStats.maxPendingReached = this.modalCacheStats.currentPending;
        }
        
        this.showNavigationModal(url, (userAllowed) => {
          // Remove from pending map and update stats
          if (this.pendingModalKeys.delete(messageId)) {
            this.modalCacheStats.currentPending--;
          }
          
          // Send response with the user's decision
          window.postMessage({
            type: 'NAV_GUARDIAN_RESPONSE',
            messageId: messageId,
            allowed: userAllowed
          }, '*');
        }, combinedAnalysis);
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

  /**
   * Safely create a DOM element with text content (prevents XSS)
   * @param {string} tagName - Element tag name
   * @param {object} options - Element configuration
   * @returns {HTMLElement}
   */
  createSafeElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    // Set text content safely (auto-escapes HTML)
    if (options.textContent) {
      element.textContent = options.textContent;
    }

    // Set styles via cssText (safe)
    if (options.style) {
      element.style.cssText = options.style;
    }

    // Set attributes
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    // Append children
    if (options.children) {
      options.children.forEach(child => {
        if (child) element.appendChild(child);
      });
    }

    return element;
  }

  /**
   * Show enhanced confirmation modal with threat details
   * @param {string} targetURL - The target URL
   * @param {Function} callback - Callback function with user decision
   * @param {Object} threatDetails - Optional threat analysis details
   */
  showNavigationModal(targetURL, callback, threatDetails = null) {
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
      z-index: ${MAX_Z_INDEX};
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

    // Note: URL sanitization removed - textContent handles escaping automatically

    // Determine threat level and message
    const isPopUnder = threatDetails?.isPopUnder || false;
    const riskScore = threatDetails?.riskScore || 0;
    const threats = threatDetails?.threats || [];
    
    const threatLevel = riskScore >= 8 ? 'HIGH' : riskScore >= 4 ? 'MEDIUM' : 'LOW';
    const threatColor = threatLevel === 'HIGH' ? '#dc2626' : threatLevel === 'MEDIUM' ? '#d97706' : '#059669';
    
    // Build threat details container (if threats exist)
    let threatDetailsDiv = null;
    if (threatDetails && threats.length > 0) {
      const topThreats = threats.slice(0, 3);

      // Create threat list items safely
      const threatListItems = topThreats.map(threat =>
        this.createSafeElement('li', {
          textContent: `${threat.type} (Risk: ${threat.score})`,
          style: 'margin-bottom: 2px;'
        })
      );

      const threatList = this.createSafeElement('ul', {
        style: 'margin: 4px 0 0 16px; padding: 0;',
        children: threatListItems
      });

      const threatTitle = this.createSafeElement('strong', {
        textContent: 'Detected threats:'
      });

      const threatContent = this.createSafeElement('div', {
        style: 'font-size: 13px; color: #7f1d1d;',
        children: [threatTitle, threatList]
      });

      const threatLevelSpan = this.createSafeElement('span', {
        textContent: `⚠️ Threat Level: ${threatLevel}`,
        style: `color: ${threatColor}; font-weight: 600; font-size: 14px;`
      });

      const threatHeader = this.createSafeElement('div', {
        style: 'display: flex; align-items: center; margin-bottom: 8px;',
        children: [threatLevelSpan]
      });

      // Add pop-under badge if applicable
      if (isPopUnder) {
        const popUnderBadge = this.createSafeElement('span', {
          textContent: 'POP-UNDER',
          style: 'margin-left: 8px; background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px;'
        });
        threatHeader.appendChild(popUnderBadge);
      }

      // Assemble complete threat details
      threatDetailsDiv = this.createSafeElement('div', {
        style: 'background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;',
        children: [threatHeader, threatContent]
      });
    }
    
    // Build modal content safely using DOM manipulation
    const modalHeader = this.createSafeElement('h3', {
      textContent: '🛡️ Navigation Guardian',
      style: 'margin: 0 0 12px 0; font-size: 18px; color: #1f2937;'
    });

    const modalDescription = this.createSafeElement('p', {
      textContent: isPopUnder
        ? 'Blocked a pop-under advertisement attempting to open:'
        : 'This page is trying to navigate to an external site:',
      style: 'margin: 0; color: #6b7280; line-height: 1.5;'
    });

    const headerDiv = this.createSafeElement('div', {
      style: 'margin-bottom: 16px;',
      children: [modalHeader, modalDescription]
    });

    // URL display (textContent auto-escapes)
    const urlDiv = this.createSafeElement('div', {
      textContent: targetURL,
      style: 'background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 20px; word-break: break-all; font-family: monospace; font-size: 14px; color: #374151;'
    });

    // Create buttons
    const denyButton = this.createSafeElement('button', {
      textContent: isPopUnder ? 'Block Ad' : 'Block',
      style: 'background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;',
      attributes: { id: 'justui-nav-deny' }
    });

    const allowButton = this.createSafeElement('button', {
      textContent: 'Allow',
      style: 'background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;',
      attributes: { id: 'justui-nav-allow' }
    });

    const buttonContainer = this.createSafeElement('div', {
      style: 'display: flex; gap: 12px; justify-content: flex-end;',
      children: [denyButton, allowButton]
    });

    // Assemble modal content
    const modalContent = [headerDiv];
    if (threatDetailsDiv) {
      modalContent.push(threatDetailsDiv);
    }
    modalContent.push(urlDiv, buttonContainer);

    // Clear modal and append safe content
    modal.innerHTML = ''; // Clear existing content
    modalContent.forEach(element => modal.appendChild(element));

    overlay.appendChild(modal);

    // Track if the modal has been responded to
    let hasResponded = false;

    // Handle responses
    const cleanup = () => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (style.parentNode) style.parentNode.removeChild(style);
    };

    const handleAllow = () => {
      if (hasResponded) return;
      hasResponded = true;
      
      console.log('JustUI: Navigation Guardian - User allowed navigation to:', targetURL);
      cleanup();
      this.navigationStats.allowedCount++;
      this.updateNavigationStats();
      callback(true);
    };

    const handleDeny = () => {
      if (hasResponded) return;
      hasResponded = true;
      
      console.log('JustUI: Navigation Guardian - User blocked navigation to:', targetURL);
      cleanup();
      this.navigationStats.blockedCount++;
      this.updateNavigationStats();
      callback(false);
    };

    // Event listeners - buttons are already in DOM
    denyButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDeny();
    }, { once: true });

    allowButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAllow();
    }, { once: true });

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

    // Add modal to page and focus
    document.body.appendChild(overlay);
    
    // Focus deny button by default (safer choice)
    setTimeout(() => {
      if (!hasResponded && denyButton) {
        denyButton.focus();
      }
    }, 100);
    
    console.log('JustUI: Navigation Guardian modal displayed for:', targetURL);
  }

  /**
   * Analyze URLs for malicious patterns
   * @param {string} url - URL to analyze
   * @returns {Object} Analysis results with risk score and threats
   */
  analyzeURLThreats(url) {
    const analysis = {
      riskScore: 0,
      threats: [],
      isPopUnder: false
    };
    
    try {
      // URL-based threat patterns
      const urlPatterns = [
        { pattern: /adexchangeclear\.com/i, score: 8, threat: 'Known malicious ad network' },
        { pattern: /\.php\?.*param_[45]/i, score: 6, threat: 'Ad tracking parameters' },
        { pattern: /about:blank/i, score: 5, threat: 'Blank page (common pop-under technique)' },
        { pattern: /doubleclick\.net/i, score: 4, threat: 'Ad network domain' },
        { pattern: /googlesyndication\.com/i, score: 3, threat: 'Google ad network' },
        { pattern: /\.tk$|\.ml$|\.ga$/i, score: 4, threat: 'Suspicious TLD' },
        { pattern: /redirect|popup|popunder/i, score: 5, threat: 'Redirect/popup indicators' }
      ];
      
      urlPatterns.forEach(({ pattern, score, threat }) => {
        if (pattern.test(url)) {
          analysis.riskScore += score;
          analysis.threats.push({ type: threat, score });
        }
      });
      
      // Check for suspicious URL structure
      try {
        const urlObj = new URL(url);
        
        // Check for suspicious query parameters
        const suspiciousParams = ['param_4', 'param_5', 'clickid', 'adclick', 'redirect'];
        suspiciousParams.forEach(param => {
          if (urlObj.searchParams.has(param)) {
            analysis.riskScore += 3;
            analysis.threats.push({ type: `Suspicious parameter: ${param}`, score: 3 });
          }
        });
        
        // Check for random-looking domains
        if (/[a-z0-9]{10,20}\./i.test(urlObj.hostname)) {
          analysis.riskScore += 2;
          analysis.threats.push({ type: 'Random domain name pattern', score: 2 });
        }
        
      } catch (urlError) {
        analysis.riskScore += 3;
        analysis.threats.push({ type: 'Malformed URL', score: 3 });
      }
      
      analysis.isPopUnder = analysis.riskScore >= 6;
      
    } catch (error) {
      console.warn('JustUI: Error analyzing URL threats:', error);
    }
    
    return analysis;
  }

  /**
   * Inject navigation script into page
   */
  injectNavigationScript() {
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

  /**
   * Update navigation statistics in storage
   */
  updateNavigationStats() {
    chrome.storage.local.set({ navigationStats: this.navigationStats });
  }

  /**
   * Check if URL is cross-origin
   * @param {string} url - URL to check
   * @returns {boolean} True if cross-origin
   */
  isCrossOrigin(url) {
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

  /**
   * Check if target domain is trusted (uses whitelist)
   * @param {string} url - URL to check
   * @returns {boolean} True if navigation is trusted
   */
  isNavigationTrusted(url) {
    if (!url) return false;
    
    try {
      const targetUrl = new URL(url, window.location.href);
      return this.isDomainWhitelisted(targetUrl.hostname);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if domain is whitelisted with caching
   * @param {string} domain - Domain to check
   * @returns {boolean} True if whitelisted
   */
  isDomainWhitelisted(domain) {
    if (this.whitelistCache?.domain === domain) {
      return this.whitelistCache.result;
    }

    const result = this.whitelist.some(whitelistedDomain => this.domainMatches(domain, whitelistedDomain));
    this.whitelistCache = { domain, result };
    return result;
  }

  /**
   * Check if domain matches pattern (supports wildcards)
   * @param {string} domain - Domain to check
   * @param {string} pattern - Pattern to match against
   * @returns {boolean} True if domain matches pattern
   */
  domainMatches(domain, pattern) {
    // If pattern has wildcard prefix (*.example.com)
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return domain === baseDomain || domain.endsWith('.' + baseDomain);
    }

    // Exact match or subdomain match
    return domain === pattern || domain.endsWith('.' + pattern);
  }

  /**
   * Get current domain
   * @returns {string} Current domain
   */
  getCurrentDomain() {
    try {
      return new URL(window.location.href).hostname;
    } catch (error) {
      return '';
    }
  }

  /**
   * Get current navigation statistics
   * @returns {Object} Navigation statistics
   */
  getStats() {
    return { ...this.navigationStats };
  }

  /**
   * Reset navigation statistics
   */
  resetStats() {
    this.navigationStats = { blockedCount: 0, allowedCount: 0 };
    this.updateNavigationStats();
  }

  /**
   * Update whitelist and invalidate cache
   * @param {Array} whitelist - New whitelist array
   */
  updateWhitelist(whitelist) {
    this.whitelist = whitelist;
    this.whitelistCache = null;
  }

  /**
   * Enhanced cleanup with comprehensive resource management
   */
  cleanup() {
    console.log('JustUI: Starting NavigationGuardian cleanup...');
    
    // Set cleanup phase
    this.setLifecyclePhase(LIFECYCLE_PHASES.CLEANUP_PENDING);
    
    try {
      this.isEnabled = false;
      
      // Stop modal cache cleanup timer
      this.stopModalCacheCleanup();
      
      // Remove all tracked event listeners
      let removedListeners = 0;
      this.eventListeners.forEach(({ element, type, handler, options }) => {
        try {
          element.removeEventListener(type, handler, options);
          removedListeners++;
        } catch (error) {
          console.warn(`JustUI: Error removing NavigationGuardian ${type} listener:`, error);
        }
      });
      
      // Clear the listeners array
      this.eventListeners = [];
      
      // Get final cache stats before cleanup
      const finalCacheStats = this.getModalCacheStats();
      
      // Clear pending modals
      const pendingModalCount = this.pendingModalKeys.size;
      this.pendingModalKeys.clear();
      this.modalCacheStats.currentPending = 0;
      
      // Remove any existing modal
      const existingModal = document.getElementById('justui-navigation-modal');
      if (existingModal) {
        existingModal.remove();
      }
      
      // Clear cache
      this.whitelistCache = null;
      
      // Reset stats
      this.navigationStats = { blockedCount: 0, allowedCount: 0 };
      
      // Call parent cleanup
      super.cleanup();
      
      console.log('JustUI: NavigationGuardian cleanup completed:', {
        removedListeners,
        clearedPendingModals: pendingModalCount,
        finalCacheStats,
        lifecyclePhase: this.getLifecyclePhase()
      });
      
    } catch (error) {
      console.error('JustUI: Error during NavigationGuardian cleanup:', error);
      this.setLifecyclePhase(LIFECYCLE_PHASES.ERROR);
      throw error;
    }
  }
  
  /**
   * Get comprehensive statistics including cache performance
   * @returns {object} Enhanced statistics
   */
  getEnhancedStats() {
    return {
      navigationStats: this.getStats(),
      modalCache: this.getModalCacheStats(),
      lifecycle: this.getLifecycleStats(),
      eventListeners: {
        registered: this.eventListeners.length,
        types: [...new Set(this.eventListeners.map(l => l.type))]
      },
      whitelist: {
        size: this.whitelist.length,
        cacheHit: this.whitelistCache !== null
      },
      performance: {
        memoryUsage: this.estimateMemoryUsage()
      }
    };
  }
  
  /**
   * Estimate memory usage of NavigationGuardian
   * @returns {object} Memory usage estimate
   */
  estimateMemoryUsage() {
    const estimatedBytes = {
      eventListeners: this.eventListeners.length * 100, // rough estimate
      pendingModals: this.pendingModalKeys.size * 200,
      whitelist: this.whitelist.length * 50,
      stats: 500 // static overhead
    };
    
    const total = Object.values(estimatedBytes).reduce((sum, bytes) => sum + bytes, 0);
    
    return {
      breakdown: estimatedBytes,
      totalBytes: total,
      totalKB: (total / 1024).toFixed(2)
    };
  }

  /**
   * Start modal cache cleanup timer
   */
  startModalCacheCleanup() {
    if (this.modalCleanupTimer) {
      return;
    }
    
    this.modalCleanupTimer = setInterval(() => {
      this.cleanupExpiredModals();
    }, 10000); // Check every 10 seconds
    
    console.log('JustUI: Started modal cache cleanup timer');
  }
  
  /**
   * Stop modal cache cleanup timer
   */
  stopModalCacheCleanup() {
    if (this.modalCleanupTimer) {
      clearInterval(this.modalCleanupTimer);
      this.modalCleanupTimer = null;
      console.log('JustUI: Stopped modal cache cleanup timer');
    }
  }
  
  /**
   * Clean up expired modals from cache
   */
  cleanupExpiredModals() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [messageId, modalInfo] of this.pendingModalKeys) {
      if (now - modalInfo.timestamp > this.modalCacheTimeout) {
        this.pendingModalKeys.delete(messageId);
        removedCount++;
        this.modalCacheStats.currentPending--;
        this.modalCacheStats.totalCleaned++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`JustUI: Cleaned up ${removedCount} expired pending modals`);
    }
  }
  
  /**
   * Enforce limits on pending modal cache using LRU eviction with timestamp-based cleanup
   */
  enforcePendingModalLimits() {
    // First, clean up expired modals
    this.cleanupExpiredModals();
    
    if (this.pendingModalKeys.size > this.maxModalCache) {
      // Convert to array with timestamps and sort by age
      const entries = Array.from(this.pendingModalKeys.entries())
        .map(([key, value]) => ({ key, timestamp: value.timestamp }))
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const excessCount = this.pendingModalKeys.size - this.maxModalCache;
      const toRemove = entries.slice(0, excessCount);
      
      for (const { key } of toRemove) {
        this.pendingModalKeys.delete(key);
        this.modalCacheStats.currentPending--;
        this.modalCacheStats.totalCleaned++;
      }
      
      console.log(`JustUI: NavigationGuardian cache limit enforcement - removed ${toRemove.length} oldest entries`);
    }
  }
  
  /**
   * Get modal cache statistics
   * @returns {object} Cache statistics
   */
  getModalCacheStats() {
    return {
      ...this.modalCacheStats,
      cacheSize: this.pendingModalKeys.size,
      cacheLimit: this.maxModalCache,
      cacheUtilization: (this.pendingModalKeys.size / this.maxModalCache * 100).toFixed(1) + '%',
      averageModalLifetime: this.calculateAverageModalLifetime(),
      expiredModalsLastCleanup: this.getExpiredModalCount()
    };
  }
  
  /**
   * Calculate average lifetime of modals in cache
   * @returns {number} Average lifetime in milliseconds
   */
  calculateAverageModalLifetime() {
    if (this.pendingModalKeys.size === 0) return 0;
    
    const now = Date.now();
    let totalLifetime = 0;
    
    for (const modalInfo of this.pendingModalKeys.values()) {
      totalLifetime += (now - modalInfo.timestamp);
    }
    
    return Math.round(totalLifetime / this.pendingModalKeys.size);
  }
  
  /**
   * Get count of expired modals in cache
   * @returns {number} Number of expired modals
   */
  getExpiredModalCount() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const modalInfo of this.pendingModalKeys.values()) {
      if (now - modalInfo.timestamp > this.modalCacheTimeout) {
        expiredCount++;
      }
    }
    
    return expiredCount;
  }
}