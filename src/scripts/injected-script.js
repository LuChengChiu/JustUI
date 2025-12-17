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
  function safeOverride(obj, propName, newValue, context = 'property') {
    try {
      // Try the assignment first and catch any errors
      const originalValue = obj[propName];
      obj[propName] = newValue;
      
      // If no error occurred, the override was successful
      console.log(`Navigation Guardian: Successfully overrode ${context} ${propName}`);
      return true;
    } catch (e) {
      // Assignment failed - this is expected on some sites
      console.warn(`Navigation Guardian: Cannot override ${context} ${propName}:`, e.message);
      return false;
    }
  }
  
  // Safe property definition for complex cases
  function safeDefineProperty(obj, propName, descriptor, context = 'property') {
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
      
      // Send request to content script
      console.log('Navigation Guardian: Requesting permission for:', url);
      window.postMessage({
        type: 'NAV_GUARDIAN_CHECK',
        url: url,
        messageId: messageId
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

  // Override window.open (usually works)
  overrideStatus.windowOpen = safeOverride(window, 'open', function(url, name, features) {
    if (!isCrossOrigin(url)) {
      return originalWindowOpen.call(this, url, name, features);
    }
    
    // For cross-origin URLs, check permission first
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