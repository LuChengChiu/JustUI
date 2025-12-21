/**
 * RequestBlockingProtector Module
 * 
 * Provides client-side request monitoring and reporting functionality
 * to complement the declarativeNetRequest blocking at the browser level.
 * 
 * Features:
 * - Monitor blocked requests in DevTools Network tab
 * - Track blocking statistics
 * - Report blocked request attempts to background script
 */

class RequestBlockingProtector {
  constructor() {
    this.isEnabled = false;
    this.blockRequestList = [];
    this.blockedRequests = new WeakMap(); // Use WeakMap for automatic GC of request objects
    this.requestCache = new Map(); // Separate cache for URL tracking with limits
    this.observer = null;
    this.maxCacheSize = 1000; // Limit cache size to prevent memory bloat
  }

  async initialize() {
    try {
      const storage = await chrome.storage.local.get([
        'requestBlockingEnabled',
        'blockRequestList'
      ]);
      
      this.isEnabled = storage.requestBlockingEnabled !== false;
      this.blockRequestList = storage.blockRequestList || [];
      
      if (this.isEnabled) {
        this.startMonitoring();
      }
      
      console.log('RequestBlockingProtector initialized:', {
        enabled: this.isEnabled,
        rulesCount: this.blockRequestList.length
      });
      
    } catch (error) {
      console.error('Failed to initialize RequestBlockingProtector:', error);
    }
  }

  startMonitoring() {
    if (!this.isEnabled) return;
    
    // Monitor fetch requests
    this.interceptFetch();
    
    // Monitor XHR requests
    this.interceptXHR();
    
    // Monitor resource loading attempts via PerformanceObserver
    this.monitorResourceLoading();
  }

  stopMonitoring() {
    // Restore original implementations would require more complex state management
    // For now, we'll disable the protector through the enabled flag
    this.isEnabled = false;
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  interceptFetch() {
    const originalFetch = window.fetch;
    const blockList = this.blockRequestList;
    const self = this;
    
    window.fetch = function(resource, options) {
      const url = typeof resource === 'string' ? resource : resource.url;
      
      if (self.shouldBlockRequest(url)) {
        const error = new Error(`net::ERR_BLOCKED_BY_CLIENT - Request blocked by JustUI: ${url}`);
        error.name = 'NetworkError';
        self.recordBlockedRequest(url, 'fetch');
        return Promise.reject(error);
      }
      
      return originalFetch.apply(this, arguments);
    };
  }

  interceptXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const self = this;
    
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      if (self.shouldBlockRequest(url)) {
        self.recordBlockedRequest(url, 'xmlhttprequest');
        
        // Override send to immediately fail
        this.send = function() {
          setTimeout(() => {
            if (this.onerror) {
              this.onerror(new Error(`net::ERR_BLOCKED_BY_CLIENT - Request blocked by JustUI: ${url}`));
            }
          }, 0);
        };
        
        return;
      }
      
      return originalOpen.apply(this, arguments);
    };
  }

  monitorResourceLoading() {
    if ('PerformanceObserver' in window) {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (this.shouldBlockRequest(entry.name)) {
            this.recordBlockedRequest(entry.name, 'resource');
          }
        }
      });
      
      this.observer.observe({ entryTypes: ['resource'] });
    }
  }

  shouldBlockRequest(url) {
    if (!this.isEnabled || !url) return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      return this.blockRequestList.some(entry => {
        if (entry.isRegex) {
          const regex = new RegExp(entry.trigger);
          return regex.test(hostname) || regex.test(url);
        } else {
          return hostname === entry.trigger || 
                 hostname.endsWith('.' + entry.trigger) ||
                 url.includes(entry.trigger);
        }
      });
    } catch (error) {
      console.warn('Invalid URL for blocking check:', url, error);
      return false;
    }
  }

  recordBlockedRequest(url, type) {
    const key = `${type}:${url}`;
    
    // Use limited cache instead of growing Map to prevent memory bloat
    this.enforceCacheLimit();
    
    const existing = this.requestCache.get(key);
    
    if (existing) {
      existing.count++;
      existing.lastBlocked = Date.now();
    } else {
      this.requestCache.set(key, {
        url,
        type,
        count: 1,
        firstBlocked: Date.now(),
        lastBlocked: Date.now()
      });
    }
    
    // Report to background script for statistics
    chrome.runtime.sendMessage({
      action: 'recordBlockedRequest',
      data: { url, type, timestamp: Date.now() }
    }).catch(() => {}); // Ignore errors if background script is not available
    
    console.log(`🛡️ JustUI blocked request: ${type} - ${url}`);
  }

  getBlockingStats() {
    const stats = {
      totalBlocked: 0,
      byType: {},
      byDomain: {},
      recentBlocks: [],
      cacheSize: this.requestCache.size,
      cacheLimit: this.maxCacheSize
    };
    
    for (const [key, data] of this.requestCache) {
      stats.totalBlocked += data.count;
      stats.byType[data.type] = (stats.byType[data.type] || 0) + data.count;
      
      try {
        const domain = new URL(data.url).hostname;
        stats.byDomain[domain] = (stats.byDomain[domain] || 0) + data.count;
      } catch (error) {
        // Invalid URL, skip domain stats
      }
      
      if (Date.now() - data.lastBlocked < 60000) { // Last minute
        stats.recentBlocks.push(data);
      }
    }
    
    return stats;
  }

  async updateSettings(newSettings) {
    if (newSettings.hasOwnProperty('requestBlockingEnabled')) {
      this.isEnabled = newSettings.requestBlockingEnabled;
    }
    
    if (newSettings.blockRequestList) {
      this.blockRequestList = newSettings.blockRequestList;
    }
    
    if (this.isEnabled) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * Enforce cache size limits using LRU eviction
   */
  enforceCacheLimit() {
    if (this.requestCache.size > this.maxCacheSize) {
      // Convert to array and sort by lastBlocked (oldest first)
      const entries = Array.from(this.requestCache.entries())
        .sort((a, b) => a[1].lastBlocked - b[1].lastBlocked);
      
      // Remove oldest 20% of entries
      const toRemove = Math.floor(this.maxCacheSize * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.requestCache.delete(entries[i][0]);
      }
      
      console.log(`JustUI: RequestBlockingProtector cache cleaned up, removed ${toRemove} old entries`);
    }
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    this.stopMonitoring();
    this.requestCache.clear();
    
    // Create new WeakMap to clear any references
    this.blockedRequests = new WeakMap();
    
    console.log('JustUI: RequestBlockingProtector cleaned up');
  }

  // Backward compatibility
  destroy() {
    this.cleanup();
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RequestBlockingProtector;
} else {
  window.RequestBlockingProtector = RequestBlockingProtector;
}