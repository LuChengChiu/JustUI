/**
 * Mutation Protection Module
 * Enhanced MutationObserver with immediate threat response
 */
import { SuspiciousElementDetector } from './SuspiciousElementDetector.js';
import { ElementRemover } from './ElementRemover.js';
import { MAX_Z_INDEX } from '../constants.js';

export class MutationProtector {
  constructor() {
    this.observer = null;
    this.isActive = false;
    this.executionTimeout = null;
    this.immediateRemovalCount = 0;
    
    // Event-based communication instead of direct module reference
    this.callbacks = {
      onSuspiciousElementDetected: [],
      onImmediateRemoval: [],
      onScheduledExecution: [],
      onClickHijackingDetected: [] // New callback for click hijacking events
    };
  }

  /**
   * Start mutation protection
   * @param {Object} config - Configuration options
   */
  start(config = {}) {
    const {
      isActive = true,
      isDomainWhitelisted = false,
      executeRulesCallback = null
    } = config;

    if (!isActive || isDomainWhitelisted) {
      this.stop();
      return;
    }

    this.isActive = true;
    this.executeRulesCallback = executeRulesCallback;
    this.setupObserver();
    
    console.log('JustUI: Mutation protector started');
  }

  /**
   * Stop mutation protection
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.executionTimeout) {
      clearTimeout(this.executionTimeout);
      this.executionTimeout = null;
    }

    this.isActive = false;
    console.log('JustUI: Mutation protector stopped');
  }

  /**
   * Clean up all resources and observers
   */
  cleanup() {
    // Stop the mutation observer
    this.stop();
    
    // Clear all callbacks
    Object.keys(this.callbacks).forEach(eventType => {
      this.callbacks[eventType] = [];
    });
    
    // Clear execution callback
    this.executeRulesCallback = null;
    
    // Reset state
    this.immediateRemovalCount = 0;
    
    console.log('JustUI: Mutation protector cleaned up');
  }

  /**
   * Setup the MutationObserver with enhanced immediate response
   */
  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isActive) return;

      let shouldExecuteRules = false;
      this.immediateRemovalCount = 0;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Immediate threat response
          const removedCount = this.handleAddedNodes(mutation.addedNodes);
          this.immediateRemovalCount += removedCount;
          
          if (removedCount > 0) {
            this.notifyCallbacks('onImmediateRemoval', {
              removedCount,
              mutationTime: Date.now()
            });
          }

          shouldExecuteRules = true;
        }
      });

      // Log immediate removals
      if (this.immediateRemovalCount > 0) {
        console.log(`JustUI: MutationProtector immediately removed ${this.immediateRemovalCount} threats`);
      }

      // Schedule full rule execution (debounced)
      if (shouldExecuteRules && this.executeRulesCallback) {
        this.scheduleRuleExecution();
      }
    });

    // Start observing
    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: false, // Focus on new elements, not attribute changes
        attributeOldValue: false,
        characterData: false,
        characterDataOldValue: false
      });

      console.log('JustUI: MutationProtector observing', targetNode.tagName);
    } else {
      console.warn('JustUI: No valid target node for MutationProtector');
    }
  }

  /**
   * Handle newly added nodes with immediate threat response
   * @param {NodeList} addedNodes - Newly added DOM nodes
   * @returns {number} - Count of immediately removed elements
   */
  handleAddedNodes(addedNodes) {
    let immediatelyRemovedCount = 0;

    addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Immediate threat detection and removal
        const threats = this.detectImmediateThreats(node);
        
        threats.forEach(threat => {
          const { element, threatType, confidence } = threat;
          
          console.warn('JustUI: MutationProtector detected immediate threat', JSON.stringify({
            threatType,
            confidence,
            element: element.tagName,
            style: element.getAttribute('style'),
            src: element.src
          }, null, 2));

          // Remove immediately
          if (ElementRemover.removeElement(element, `mutation-${threatType}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
            immediatelyRemovedCount++;
            
            // Emit event instead of direct call to avoid circular dependency
            if (threatType === 'click-hijacking') {
              this.notifyCallbacks('onClickHijackingDetected', {
                element,
                threatType,
                confidence,
                action: 'scan_overlays'
              });
            }
          }
        });
      }
    });

    return immediatelyRemovedCount;
  }

  /**
   * Detect immediate threats in newly added elements
   * @param {HTMLElement} element - Element to scan
   * @returns {Array} - Array of detected threats
   */
  detectImmediateThreats(element) {
    const threats = [];

    // Check the element itself
    if (this.isImmediateThreat(element)) {
      threats.push({
        element,
        ...this.classifyThreat(element)
      });
    }

    // Check child elements for threats
    if (element.querySelectorAll) {
      // Check iframes
      const iframes = element.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        if (this.isImmediateThreat(iframe)) {
          threats.push({
            element: iframe,
            ...this.classifyThreat(iframe)
          });
        }
      });

      // Check suspicious links
      const links = element.querySelectorAll('a[href*="adexchangeclear"], a[href*="/c.php"]');
      links.forEach(link => {
        if (this.isImmediateThreat(link)) {
          threats.push({
            element: link,
            ...this.classifyThreat(link)
          });
        }
      });
    }

    return threats;
  }

  /**
   * Check if element is an immediate threat requiring instant removal
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - True if immediate threat
   */
  isImmediateThreat(element) {
    // High-confidence iframe threats
    if (element.tagName === 'IFRAME') {
      const detection = SuspiciousElementDetector.detectSuspiciousIframe(element);
      return detection.confidence > 0.8; // High confidence threshold for immediate action
    }

    // High-confidence ad link threats
    if (element.tagName === 'A') {
      const detection = SuspiciousElementDetector.detectAdLinks(element);
      return detection.confidence > 0.8;
    }

    // Chrome ad tags
    const chromeDetection = SuspiciousElementDetector.detectChromeAdTags(element);
    return chromeDetection.confidence > 0.7;
  }

  /**
   * Classify the type of threat
   * @param {HTMLElement} element - Element to classify
   * @returns {Object} - Threat classification
   */
  classifyThreat(element) {
    const style = element.getAttribute('style') || '';
    
    // Click hijacking iframe
    if (element.tagName === 'IFRAME' && 
        style.includes('opacity: 0') && 
        style.includes(`z-index: ${MAX_Z_INDEX}`)) {
      return {
        threatType: 'click-hijacking',
        confidence: 0.95
      };
    }

    // Ad network iframe
    if (element.tagName === 'IFRAME' && element.src) {
      const adNetworks = ['googlesyndication', 'doubleclick', 'adexchangeclear'];
      for (const network of adNetworks) {
        if (element.src.includes(network)) {
          return {
            threatType: 'ad-iframe',
            confidence: 0.9
          };
        }
      }
    }

    // Ad tracking link
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || '';
      if (href.includes('adexchangeclear') || href.includes('/c.php')) {
        return {
          threatType: 'ad-link',
          confidence: 0.85
        };
      }
    }

    return {
      threatType: 'unknown',
      confidence: 0.5
    };
  }

  /**
   * Schedule debounced rule execution
   */
  scheduleRuleExecution() {
    if (this.executionTimeout) {
      clearTimeout(this.executionTimeout);
    }

    this.executionTimeout = setTimeout(() => {
      if (this.executeRulesCallback) {
        this.executeRulesCallback();
        this.notifyCallbacks('onScheduledExecution', {
          executionTime: Date.now()
        });
      }
    }, 500); // 500ms debounce
  }

  /**
   * Add callback for events
   * @param {string} eventType - Event type (onSuspiciousElementDetected, onImmediateRemoval, onScheduledExecution)
   * @param {Function} callback - Callback function
   */
  onEvent(eventType, callback) {
    if (this.callbacks[eventType]) {
      this.callbacks[eventType].push(callback);
    }
  }

  /**
   * Remove callback
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function to remove
   */
  offEvent(eventType, callback) {
    if (this.callbacks[eventType]) {
      const index = this.callbacks[eventType].indexOf(callback);
      if (index > -1) {
        this.callbacks[eventType].splice(index, 1);
      }
    }
  }

  /**
   * Notify all callbacks for an event type
   * @param {string} eventType - Event type
   * @param {Object} data - Data to pass to callbacks
   */
  notifyCallbacks(eventType, data) {
    if (this.callbacks[eventType]) {
      this.callbacks[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`JustUI: Error in ${eventType} callback:`, error);
        }
      });
    }
  }

  /**
   * Get statistics
   * @returns {Object} - Protection statistics
   */
  getStats() {
    return {
      isActive: this.isActive,
      immediateRemovalCount: this.immediateRemovalCount,
      hasActiveObserver: !!this.observer
    };
  }
}