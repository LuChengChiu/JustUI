// Injected script for Navigation Guardian
// Runs in the page's main world to intercept JavaScript navigation

(function() {
  'use strict';
  
  // Only inject once per page
  if (window.navigationGuardianInjected) {
    return;
  }
  window.navigationGuardianInjected = true;

  // Feature detection and safe override utilities
  function canOverrideProperty(obj, propName) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, propName);
      if (descriptor) {
        return descriptor.writable !== false && descriptor.configurable !== false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeOverride(obj, propName, newValue, context = 'property') {
    // Pre-check if property can be overridden
    if (!canOverrideProperty(obj, propName)) {
      console.info(`Navigation Guardian: Skipping ${context} ${propName} - not writable/configurable`);
      return false;
    }

    try {
      const originalValue = obj[propName];
      obj[propName] = newValue;
      
      console.log(`Navigation Guardian: Successfully overrode ${context} ${propName}`);
      return true;
    } catch (e) {
      console.warn(`Navigation Guardian: Cannot override ${context} ${propName}:`, e.message);
      return false;
    }
  }
  
  // Safe property definition for complex cases
  function safeDefineProperty(obj, propName, descriptor, context = 'property') {
    // Pre-check if property exists and is configurable
    try {
      const existingDescriptor = Object.getOwnPropertyDescriptor(obj, propName);
      if (existingDescriptor && existingDescriptor.configurable === false) {
        console.info(`Navigation Guardian: Skipping ${context} ${propName} - not configurable`);
        return false;
      }
    } catch (e) {
      console.warn(`Navigation Guardian: Cannot check descriptor for ${context} ${propName}`);
      return false;
    }

    try {
      Object.defineProperty(obj, propName, descriptor);
      console.log(`Navigation Guardian: Successfully defined ${context} ${propName}`);
      return true;
    } catch (e) {
      console.warn(`Navigation Guardian: Cannot define ${context} ${propName}:`, e.message);
      return false;
    }
  }

  // Save original functions before overriding (with safety checks)
  const originalWindowOpen = window.open;
  let originalLocationAssign = null;
  let originalLocationReplace = null;
  let originalHrefDescriptor = null;
  
  // Safely capture original methods
  try {
    originalLocationAssign = window.location.assign;
  } catch (e) {
    console.warn('Navigation Guardian: Cannot access location.assign');
  }

  try {
    originalLocationReplace = window.location.replace;
  } catch (e) {
    console.warn('Navigation Guardian: Cannot access location.replace');
  }

  try {
    originalHrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href') || 
                            Object.getOwnPropertyDescriptor(window.location, 'href');
  } catch (e) {
    console.warn('Navigation Guardian: Cannot access href descriptor');
  }

  // Utility function to check if URL is cross-origin
  function isCrossOrigin(url) {
    if (!url) return false;
    
    // Ignore special protocols
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

  // Generate unique message ID for communication
  function generateMessageId() {
    return 'nav-guard-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // Send message to content script and wait for response
  function checkNavigationPermission(url) {
    return new Promise((resolve) => {
      const messageId = generateMessageId();
      let hasResolved = false;
      
      // Longer timeout to allow for user interaction (30 seconds)
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          console.warn('Navigation Guardian: Permission check timed out for:', url);
          resolve(false);
        }
      }, 30000);

      // Listen for response
      function handleResponse(event) {
        if (event.source !== window || hasResolved) return;
        
        if (event.data?.type === 'NAV_GUARDIAN_RESPONSE' && event.data?.messageId === messageId) {
          hasResolved = true;
          clearTimeout(timeout);
          window.removeEventListener('message', handleResponse);
          
          const allowed = event.data.allowed || false;
          console.log(`Navigation Guardian: Permission ${allowed ? 'granted' : 'denied'} for:`, url);
          resolve(allowed);
        }
      }
      
      window.addEventListener('message', handleResponse);
      
      // Send request to content script with pop-under analysis
      console.log('Navigation Guardian: Requesting permission for:', url);
      window.postMessage({
        type: 'NAV_GUARDIAN_CHECK',
        url: url,
        messageId: messageId,
        popUnderAnalysis: {
          isPopUnder: true, // This function is only called for suspected pop-unders
          score: 7, // Base score for detected pop-under attempt
          threats: [{
            type: 'Window.open() pop-under attempt detected',
            score: 7
          }]
        }
      }, '*');
    });
  }

  // Track which overrides were successful
  const overrideStatus = {
    windowOpen: false,
    locationAssign: false,
    locationReplace: false,
    locationHref: false
  };

  // Pop-under detection patterns
  const popUnderPatterns = [
    /adexchangeclear\.com/i,
    /\.php\?.*param_[45]/i,
    /^\s*about:blank\s*$/,
    /clicktraking/i,
    /popunder/i,
    /redirect.*click/i
  ];
  
  // Track window.open() call patterns for pop-under detection
  let recentWindowOpens = [];
  let lastDocumentClick = 0;
  
  // Store original EventTarget methods to prevent malicious override
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  
  // Track suspicious click listeners for removal
  const suspiciousListeners = new WeakMap();
  
  // Listen for document clicks to detect pop-under triggers
  document.addEventListener('click', () => {
    lastDocumentClick = Date.now();
  }, true);
  
  // Override addEventListener to intercept and block malicious click listeners
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    // Block deprecated 'unload' event - violates Permissions Policy in modern Chrome
    // See: https://developer.chrome.com/blog/deprecating-unload
    if (type === 'unload') {
      console.info('Navigation Guardian: Blocked deprecated "unload" event listener. Use "pagehide" with { capture: true } instead.');
      // Silently ignore - don't throw, just don't register
      return;
    }

    // Check if this is a suspicious click listener
    if (type === 'click' && typeof listener === 'function') {
      const listenerStr = listener.toString();
      
      // Patterns that indicate malicious pop-under click listeners
      const maliciousPatterns = [
        /triggerPopUnder/i,
        /window\.open.*_blank/,
        /localStorage\..*lastPopUnderTime/i,
        /adexchangeclear/i,
        /param_[45]/,
        /generateClickId/i,
        /DELAY_IN_MILLISECONDS/i
      ];
      
      const isSuspicious = maliciousPatterns.some(pattern => pattern.test(listenerStr));
      
      if (isSuspicious) {
        console.log('Navigation Guardian: Blocked malicious click listener:', {
          target: this.tagName || this.constructor.name,
          listener: listenerStr.substring(0, 200) + '...',
          options: options
        });
        
        // Mark this listener as blocked
        suspiciousListeners.set(listener, true);
        
        // Don't actually add the malicious listener
        return;
      }
    }
    
    // Call original addEventListener for legitimate listeners
    return originalAddEventListener.call(this, type, listener, options);
  };
  
  // Clean up existing malicious listeners on the document
  function cleanupMaliciousListeners() {
    try {
      // We can't directly enumerate existing listeners, but we can replace common targets
      const scriptElements = document.querySelectorAll('script');
      scriptElements.forEach(script => {
        const content = script.textContent || script.innerHTML || '';
        
        // If script contains pop-under patterns, remove it
        const maliciousPatterns = [
          /triggerPopUnder/i,
          /document\.addEventListener.*click.*triggerPopUnder/i,
          /window\.open.*_blank.*window\.focus/i
        ];
        
        if (maliciousPatterns.some(pattern => pattern.test(content))) {
          console.log('Navigation Guardian: Removing malicious script with pop-under code');
          script.remove();
        }
      });
      
      // Try to remove click listeners from document by cloning (nuclear option)
      if (document.body) {
        const newDocument = document.cloneNode(false);
        const newBody = document.body.cloneNode(true);
        
        // This approach is too aggressive, but we could use it as last resort
        // newDocument.appendChild(newBody);
      }
      
    } catch (error) {
      console.warn('Navigation Guardian: Error cleaning up malicious listeners:', error);
    }
  }
  
  // Run cleanup immediately
  cleanupMaliciousListeners();
  
  function isPopUnderBehavior(url, name, features) {
    const now = Date.now();
    
    // Check if this window.open() is triggered within 1 second of a document click
    const isClickTriggered = (now - lastDocumentClick) < 1000;
    
    // Check for pop-under URL patterns
    const hasPopUnderURL = popUnderPatterns.some(pattern => pattern.test(url || ''));
    
    // Check for _blank target with immediate focus (pop-under characteristic)
    const isBlankTarget = name === '_blank' || name === '';
    
    // Track recent window.open() calls to detect rate limiting behavior
    recentWindowOpens.push(now);
    recentWindowOpens = recentWindowOpens.filter(time => (now - time) < 60000); // Keep last minute
    
    const tooFrequent = recentWindowOpens.length > 3; // More than 3 opens per minute
    
    // Combine factors to determine pop-under likelihood
    const popUnderScore = 
      (isClickTriggered ? 3 : 0) +
      (hasPopUnderURL ? 4 : 0) +
      (isBlankTarget ? 2 : 0) +
      (tooFrequent ? 2 : 0);
    
    return {
      isPopUnder: popUnderScore >= 4,
      score: popUnderScore,
      factors: {
        clickTriggered: isClickTriggered,
        popUnderURL: hasPopUnderURL,
        blankTarget: isBlankTarget,
        tooFrequent: tooFrequent
      }
    };
  }
  
  // Enhanced window.open override with aggressive pop-under protection
  overrideStatus.windowOpen = safeOverride(window, 'open', function(url, name, features) {
    const analysis = isPopUnderBehavior(url, name, features);
    
    // Block obvious pop-unders immediately
    if (analysis.isPopUnder) {
      console.log('Navigation Guardian: Blocked pop-under attempt:', {
        url: url,
        score: analysis.score,
        factors: analysis.factors
      });
      
      // Show a brief notification
      try {
        console.warn('🛡️ JustUI blocked a pop-under advertisement');
      } catch (e) { /* ignore */ }
      
      return null;
    }
    
    // Allow same-origin navigation
    if (!isCrossOrigin(url)) {
      return originalWindowOpen.call(this, url, name, features);
    }
    
    // For cross-origin URLs that aren't obvious pop-unders, check permission
    checkNavigationPermission(url).then(allowed => {
      if (allowed) {
        originalWindowOpen.call(window, url, name, features);
      }
    });
    
    // Return null for blocked navigation
    return null;
  }, 'method');

  // Override location.assign (may fail on some sites)
  if (originalLocationAssign) {
    overrideStatus.locationAssign = safeOverride(window.location, 'assign', function(url) {
      if (!isCrossOrigin(url)) {
        return originalLocationAssign.call(this, url);
      }
      
      checkNavigationPermission(url).then(allowed => {
        if (allowed) {
          originalLocationAssign.call(window.location, url);
        }
      });
    }, 'method');
  }

  // Override location.replace (may fail on some sites)
  if (originalLocationReplace) {
    overrideStatus.locationReplace = safeOverride(window.location, 'replace', function(url) {
      if (!isCrossOrigin(url)) {
        return originalLocationReplace.call(this, url);
      }
      
      checkNavigationPermission(url).then(allowed => {
        if (allowed) {
          originalLocationReplace.call(window.location, url);
        }
      });
    }, 'method');
  }

  // Override location.href setter (often fails due to browser security)
  if (originalHrefDescriptor && originalHrefDescriptor.set) {
    overrideStatus.locationHref = safeDefineProperty(window.location, 'href', {
      get: originalHrefDescriptor.get,
      set: function(url) {
        if (!isCrossOrigin(url)) {
          return originalHrefDescriptor.set.call(this, url);
        }
        
        checkNavigationPermission(url).then(allowed => {
          if (allowed) {
            originalHrefDescriptor.set.call(window.location, url);
          }
        });
      },
      enumerable: originalHrefDescriptor.enumerable,
      configurable: originalHrefDescriptor.configurable
    }, 'property');
  }

  // Log what was successfully overridden
  const successfulOverrides = Object.entries(overrideStatus)
    .filter(([_, success]) => success)
    .map(([name, _]) => name);
    
  const failedOverrides = Object.entries(overrideStatus)
    .filter(([_, success]) => !success)
    .map(([name, _]) => name);

  console.log('Navigation Guardian: JavaScript overrides status:', {
    successful: successfulOverrides,
    failed: failedOverrides,
    note: failedOverrides.length > 0 ? 'Some overrides failed - relying on DOM interception' : 'All overrides successful'
  });
})();