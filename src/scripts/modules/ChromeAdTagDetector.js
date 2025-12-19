/**
 * Chrome Ad Tag Detection Module
 * Integrates with Chrome's native ad detection capabilities
 */
export class ChromeAdTagDetector {
  constructor() {
    this.isEnabled = false;
    this.reportingObserver = null;
    this.detectedCount = 0;
    this.interventionReports = [];
  }

  /**
   * Enable Chrome Ad Tag detection
   */
  enable() {
    this.isEnabled = true;
    this.setupReportingObserver();
    console.log('JustUI: Chrome Ad Tag detection enabled');
  }

  /**
   * Disable Chrome Ad Tag detection
   */
  disable() {
    this.isEnabled = false;
    if (this.reportingObserver) {
      this.reportingObserver.disconnect();
      this.reportingObserver = null;
    }
    console.log('JustUI: Chrome Ad Tag detection disabled');
  }

  /**
   * Setup ReportingObserver for Chrome's ad intervention reports
   */
  setupReportingObserver() {
    if (!window.ReportingObserver) {
      console.warn('JustUI: ReportingObserver not supported in this browser');
      return;
    }

    try {
      this.reportingObserver = new ReportingObserver((reports) => {
        reports.forEach(report => this.handleInterventionReport(report));
      }, {
        types: ['intervention'],
        buffered: true // Include reports that occurred before observer was created
      });

      this.reportingObserver.observe();
      console.log('JustUI: ReportingObserver setup for ad interventions');
    } catch (error) {
      console.error('JustUI: Failed to setup ReportingObserver:', error);
    }
  }

  /**
   * Handle Chrome intervention reports
   * @param {Report} report - Chrome intervention report
   */
  handleInterventionReport(report) {
    if (!this.isEnabled) return;

    const { body, type, url } = report;
    
    // Check if it's an ad-related intervention
    if (this.isAdIntervention(body.message)) {
      const interventionInfo = {
        timestamp: Date.now(),
        type: body.id || 'unknown',
        message: body.message,
        url: url,
        sourceFile: body.sourceFile,
        lineNumber: body.lineNumber,
        columnNumber: body.columnNumber
      };

      this.interventionReports.push(interventionInfo);
      this.detectedCount++;

      console.log('JustUI: Chrome ad intervention detected', interventionInfo);

      // Try to find and remove the related element
      this.findAndRemoveInterventionElement(interventionInfo);

      // Dispatch custom event for tracking
      document.dispatchEvent(new CustomEvent('justui:chrome-ad-intervention', {
        detail: interventionInfo
      }));
    }
  }

  /**
   * Check if intervention report is ad-related
   * @param {string} message - Intervention message
   * @returns {boolean} - True if ad-related
   */
  isAdIntervention(message) {
    if (!message) return false;

    const adKeywords = [
      'heavy ad',
      'cpu usage',
      'network usage', 
      'ad frame',
      'advertisement',
      'blocked resource'
    ];

    return adKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Find and remove element related to Chrome intervention
   * @param {Object} interventionInfo - Information about the intervention
   */
  findAndRemoveInterventionElement(interventionInfo) {
    // Look for elements that might be related to the intervention
    const candidates = this.findInterventionCandidates();
    
    candidates.forEach(element => {
      if (this.isLikelyInterventionTarget(element, interventionInfo)) {
        console.log('JustUI: Removing element related to Chrome intervention', {
          element: element.tagName,
          src: element.src,
          intervention: interventionInfo.type
        });
        
        element.setAttribute('data-justui-removed', 'chrome-intervention');
        element.remove();
      }
    });
  }

  /**
   * Find candidate elements that might be intervention targets
   * @returns {HTMLElement[]} - Array of candidate elements
   */
  findInterventionCandidates() {
    const candidates = [];

    // Heavy iframes (main target of Chrome's heavy ad intervention)
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      // Check if iframe has ad-related characteristics
      if (this.hasAdCharacteristics(iframe)) {
        candidates.push(iframe);
      }
    });

    // Elements with Google ad attributes
    const adElements = document.querySelectorAll(
      '[data-google-query-id], [data-google-container-id], [data-ad-slot]'
    );
    candidates.push(...adElements);

    return candidates;
  }

  /**
   * Check if element has ad-related characteristics
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - True if has ad characteristics
   */
  hasAdCharacteristics(element) {
    const src = element.src || '';
    const className = element.className || '';
    const id = element.id || '';

    // Google ad network URLs
    const googleAdPatterns = [
      'googlesyndication.com',
      'googleadservices.com', 
      'doubleclick.net',
      'adservice.google'
    ];

    // Check src attribute
    if (googleAdPatterns.some(pattern => src.includes(pattern))) {
      return true;
    }

    // Check for ad-related class names or IDs
    const adIdentifiers = ['ad', 'ads', 'banner', 'sponsor', 'promo'];
    const textToCheck = (className + ' ' + id).toLowerCase();
    
    return adIdentifiers.some(identifier => textToCheck.includes(identifier));
  }

  /**
   * Check if element is likely the target of a specific intervention
   * @param {HTMLElement} element - Element to check
   * @param {Object} interventionInfo - Intervention information
   * @returns {boolean} - True if likely target
   */
  isLikelyInterventionTarget(element, interventionInfo) {
    const { message, sourceFile } = interventionInfo;

    // If intervention has source file info, try to match
    if (sourceFile && element.src && element.src.includes(sourceFile)) {
      return true;
    }

    // Heavy ad interventions typically target iframes
    if (message.includes('heavy ad') && element.tagName === 'IFRAME') {
      return true;
    }

    // CPU usage interventions
    if (message.includes('cpu usage') && this.hasAdCharacteristics(element)) {
      return true;
    }

    return false;
  }

  /**
   * Scan for elements with Chrome ad attributes
   * @returns {Object[]} - Array of detected Chrome ad elements
   */
  scanForChromeAdElements() {
    if (!this.isEnabled) return [];

    const detectedElements = [];

    // Scan for Google ad attributes
    const attributeSelectors = [
      '[data-google-query-id]',
      '[data-google-container-id]', 
      '[data-ad-slot]',
      '[data-google-ad-client]'
    ];

    attributeSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (!element.hasAttribute('data-justui-removed')) {
          detectedElements.push({
            element,
            type: 'chrome-ad-attribute',
            confidence: 0.95,
            attributes: this.getAdAttributes(element)
          });
        }
      });
    });

    // Scan for Google ad network iframes
    const iframes = document.querySelectorAll('iframe[src*="googlesyndication"], iframe[src*="doubleclick"]');
    iframes.forEach(iframe => {
      if (!iframe.hasAttribute('data-justui-removed')) {
        detectedElements.push({
          element: iframe,
          type: 'google-ad-iframe',
          confidence: 0.9,
          src: iframe.src
        });
      }
    });

    return detectedElements;
  }

  /**
   * Get ad-related attributes from element
   * @param {HTMLElement} element - Element to inspect
   * @returns {Object} - Ad attributes
   */
  getAdAttributes(element) {
    const attributes = {};
    
    const adAttributes = [
      'data-google-query-id',
      'data-google-container-id',
      'data-ad-slot',
      'data-google-ad-client',
      'data-google-ad-width',
      'data-google-ad-height'
    ];

    adAttributes.forEach(attr => {
      if (element.hasAttribute(attr)) {
        attributes[attr] = element.getAttribute(attr);
      }
    });

    return attributes;
  }

  /**
   * Get detection statistics
   * @returns {Object} - Detection statistics
   */
  getStats() {
    return {
      isEnabled: this.isEnabled,
      detectedCount: this.detectedCount,
      interventionReports: this.interventionReports.length,
      hasReportingObserver: !!this.reportingObserver
    };
  }

  /**
   * Clean up all resources and observers
   */
  cleanup() {
    this.disable(); // This disconnects the observer
    this.detectedCount = 0;
    this.interventionReports = [];
    console.log('JustUI: ChromeAdTagDetector cleaned up');
  }

  /**
   * Clear statistics and reports
   */
  clearStats() {
    this.detectedCount = 0;
    this.interventionReports = [];
  }
}