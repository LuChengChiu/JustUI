/**
 * Suspicious Element Detection Module
 * Detects elements that match various ad and malicious patterns
 */
export class SuspiciousElementDetector {
  /**
   * Detect suspicious iframes that might be used for click hijacking or ads
   * @param {HTMLElement} iframe - Iframe element to check
   * @returns {Object} - Detection result with confidence and reasons
   */
  static detectSuspiciousIframe(iframe) {
    if (iframe.tagName !== 'IFRAME') {
      return { isSuspicious: false, confidence: 0, reasons: [] };
    }

    const style = iframe.getAttribute('style') || '';
    const computedStyle = window.getComputedStyle(iframe);
    const src = iframe.src || '';
    
    const reasons = [];
    let suspicionScore = 0;

    // Check for click hijacking patterns
    if (style.includes('position: fixed')) {
      reasons.push('Fixed positioning');
      suspicionScore += 20;
    }

    if (style.includes('width: 100%') && style.includes('height: 100%')) {
      reasons.push('Full screen dimensions');
      suspicionScore += 30;
    }

    if (style.includes('opacity: 0')) {
      reasons.push('Invisible (opacity: 0)');
      suspicionScore += 25;
    }

    if (style.includes('z-index: 2147483647') || style.includes('z-index: 21474836')) {
      reasons.push('Maximum z-index');
      suspicionScore += 35;
    }

    if (style.includes('inset:') || style.includes('inset ')) {
      reasons.push('Uses inset positioning');
      suspicionScore += 20;
    }

    // Check for ad network patterns
    const adNetworkPatterns = [
      'ads', 'doubleclick', 'googlesyndication', 'adnxs', 'adsystem',
      'adexchangeclear', 'adsymptotic', 'adform', 'amazon-adsystem'
    ];

    adNetworkPatterns.forEach(pattern => {
      if (src.includes(pattern)) {
        reasons.push(`Ad network source: ${pattern}`);
        suspicionScore += 40;
      }
    });

    // Check for hidden positioning
    if (style.includes('top: -1000px') || style.includes('left: -1000px')) {
      reasons.push('Hidden positioning (off-screen)');
      suspicionScore += 15;
    }

    if (style.includes('visibility: hidden')) {
      reasons.push('Hidden visibility');
      suspicionScore += 10;
    }

    // Check computed styles for additional patterns
    const zIndex = parseInt(computedStyle.zIndex);
    if (zIndex > 1000000) {
      reasons.push(`High z-index: ${zIndex}`);
      suspicionScore += 25;
    }

    const confidence = Math.min(suspicionScore / 100, 1);
    const isSuspicious = suspicionScore >= 50; // Threshold for suspicious

    return {
      isSuspicious,
      confidence,
      suspicionScore,
      reasons,
      element: {
        tagName: iframe.tagName,
        src: src.substring(0, 100),
        style: style.substring(0, 200),
        zIndex: computedStyle.zIndex
      }
    };
  }

  /**
   * Detect Chrome's native ad tags and attributes
   * @param {HTMLElement} element - Element to check
   * @returns {Object} - Chrome ad tag detection result
   */
  static detectChromeAdTags(element) {
    const reasons = [];
    let confidence = 0;

    // Check for Google Ad attributes
    if (element.hasAttribute('data-google-query-id')) {
      reasons.push('Google Query ID attribute');
      confidence += 0.9;
    }

    if (element.hasAttribute('data-google-container-id')) {
      reasons.push('Google Container ID attribute');
      confidence += 0.9;
    }

    if (element.hasAttribute('data-ad-slot')) {
      reasons.push('Ad slot attribute');
      confidence += 0.8;
    }

    if (element.closest && element.closest('[data-ad-slot]')) {
      reasons.push('Within ad slot container');
      confidence += 0.7;
    }

    // Check for ad network URLs in iframes
    if (element.tagName === 'IFRAME' && element.src) {
      const googleAdPatterns = [
        'googlesyndication.com',
        'doubleclick.net',
        'adservice.google',
        'googleadservices.com'
      ];

      googleAdPatterns.forEach(pattern => {
        if (element.src.includes(pattern)) {
          reasons.push(`Google ad network: ${pattern}`);
          confidence += 0.95;
        }
      });
    }

    return {
      isChromeAdTagged: confidence > 0.5,
      confidence: Math.min(confidence, 1),
      reasons,
      tagType: 'chrome-ad-tag'
    };
  }

  /**
   * Detect elements matching ad link patterns
   * @param {HTMLElement} element - Element to check (usually <a> tag)
   * @returns {Object} - Ad link detection result
   */
  static detectAdLinks(element) {
    if (element.tagName !== 'A') {
      return { isAdLink: false, confidence: 0, reasons: [] };
    }

    const href = element.getAttribute('href') || '';
    const reasons = [];
    let confidence = 0;

    // Check for ad exchange domains
    const adExchangeDomains = [
      'adexchangeclear.com',
      'doubleclick.net',
      'googlesyndication.com',
      'amazon-adsystem.com',
      'adsystem.com'
    ];

    adExchangeDomains.forEach(domain => {
      if (href.includes(domain)) {
        reasons.push(`Ad exchange domain: ${domain}`);
        confidence += 0.9;
      }
    });

    // Check for click tracking patterns
    const trackingPatterns = [
      '/c.php?', 'click.php?', '/track?', '/redirect?'
    ];

    trackingPatterns.forEach(pattern => {
      if (href.includes(pattern)) {
        reasons.push(`Click tracking pattern: ${pattern}`);
        confidence += 0.7;
      }
    });

    // Check for ad-related URL parameters
    const adParams = [
      'ad=', 'ads=', 'adid=', 'click=', 'track=', 'stamat=', 'adv='
    ];

    adParams.forEach(param => {
      if (href.includes(param)) {
        reasons.push(`Ad parameter: ${param}`);
        confidence += 0.3;
      }
    });

    // Check if link contains image (common for banner ads)
    const hasImage = element.querySelector('img') !== null;
    if (hasImage && confidence > 0.3) {
      reasons.push('Contains image (banner ad pattern)');
      confidence += 0.2;
    }

    return {
      isAdLink: confidence > 0.5,
      confidence: Math.min(confidence, 1),
      reasons,
      href: href.substring(0, 100)
    };
  }

  /**
   * Scan for newly added suspicious elements via MutationObserver
   * @param {Node[]} addedNodes - Array of newly added DOM nodes
   * @returns {HTMLElement[]} - Array of suspicious elements found
   */
  static scanAddedNodes(addedNodes) {
    const suspiciousElements = [];

    addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check the node itself
        if (this.isElementSuspicious(node)) {
          suspiciousElements.push(node);
        }

        // Check child elements
        if (node.querySelectorAll) {
          const childIframes = node.querySelectorAll('iframe');
          childIframes.forEach(iframe => {
            const detection = this.detectSuspiciousIframe(iframe);
            if (detection.isSuspicious) {
              suspiciousElements.push(iframe);
            }
          });

          const childLinks = node.querySelectorAll('a[href]');
          childLinks.forEach(link => {
            const detection = this.detectAdLinks(link);
            if (detection.isAdLink) {
              suspiciousElements.push(link);
            }
          });
        }
      }
    });

    return suspiciousElements;
  }

  /**
   * Quick check if element is suspicious (used by MutationObserver)
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - True if suspicious
   */
  static isElementSuspicious(element) {
    if (!element || !element.tagName) return false;

    // Quick iframe check
    if (element.tagName === 'IFRAME') {
      const detection = this.detectSuspiciousIframe(element);
      return detection.isSuspicious;
    }

    // Quick link check
    if (element.tagName === 'A') {
      const detection = this.detectAdLinks(element);
      return detection.isAdLink;
    }

    // Quick Chrome ad tag check
    const chromeDetection = this.detectChromeAdTags(element);
    if (chromeDetection.isChromeAdTagged) {
      return true;
    }

    return false;
  }
}