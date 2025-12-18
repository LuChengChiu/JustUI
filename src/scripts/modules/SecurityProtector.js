/**
 * SecurityProtector Module
 * Provides event listener protection and localStorage monitoring
 */
export class SecurityProtector {
  constructor() {
    this.isActive = false;
    this.protectionInterval = null;
    this.originalLocalStorageSetItem = null;
    console.log('JustUI: SecurityProtector initialized');
  }

  /**
   * Activate all security protections
   */
  activate() {
    this.isActive = true;
    this.setupEventListenerProtection();
    console.log('JustUI: Security protections activated');
  }

  /**
   * Deactivate all security protections
   */
  deactivate() {
    this.isActive = false;
    this.cleanupProtections();
    console.log('JustUI: Security protections deactivated');
  }

  /**
   * Event Listener Protection: Remove malicious click handlers and monitor localStorage
   */
  setupEventListenerProtection() {
    try {
      // Try to remove malicious click listeners by replacing elements
      this.protectionInterval = setInterval(() => {
        if (!this.isActive) return;

        // Look for elements that might have malicious click handlers attached
        const suspiciousElements = document.querySelectorAll('body, html');

        suspiciousElements.forEach(element => {
          // Check if element has suspicious data attributes or patterns
          const hasPopUnderAttributes = [
            'data-popunder',
            'data-click-redirect',
            'data-ad-click',
            'onclick'
          ].some(attr => element.hasAttribute(attr));

          if (hasPopUnderAttributes) {
            // Remove onclick handlers
            element.removeAttribute('onclick');
            element.onclick = null;

            console.log('JustUI: Removed suspicious onclick from element:', element.tagName);
          }
        });
      }, 1000);

      // Stop checking after 30 seconds to avoid performance impact
      setTimeout(() => {
        if (this.protectionInterval) {
          clearInterval(this.protectionInterval);
          this.protectionInterval = null;
        }
      }, 30000);

      // Advanced technique: Monitor for LocalStorage access patterns
      this.setupLocalStorageMonitoring();

      // Clean up existing pop-under localStorage entries
      this.cleanupExistingLocalStorage();

      console.log('JustUI: Event listener protection active');

    } catch (error) {
      console.error('JustUI: Error setting up event listener protection:', error);
    }
  }

  /**
   * Setup LocalStorage monitoring to block malicious writes
   */
  setupLocalStorageMonitoring() {
    try {
      this.originalLocalStorageSetItem = localStorage.setItem;
      localStorage.setItem = (key, value) => {
        // Block pop-under related localStorage writes
        if (key && (
          key.includes('lastPopUnderTime') ||
          key.includes('popunder') ||
          key.includes('adClick') ||
          key.includes('clickId')
        )) {
          console.log('JustUI: Blocked malicious localStorage write:', key, value);
          return; // Block the write
        }

        return this.originalLocalStorageSetItem.call(localStorage, key, value);
      };
    } catch (error) {
      console.warn('JustUI: Could not setup localStorage monitoring:', error);
    }
  }

  /**
   * Clean up existing malicious localStorage entries
   */
  cleanupExistingLocalStorage() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('lastPopUnderTime') ||
          key.includes('popunder') ||
          key.includes('adClick')
        )) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log('JustUI: Removed malicious localStorage entry:', key);
      });

    } catch (error) {
      console.warn('JustUI: Could not clean localStorage:', error);
    }
  }

  /**
   * Clean up protection intervals and restore original functions
   */
  cleanupProtections() {
    if (this.protectionInterval) {
      clearInterval(this.protectionInterval);
      this.protectionInterval = null;
    }

    // Restore original localStorage.setItem if it was overridden
    if (this.originalLocalStorageSetItem) {
      try {
        localStorage.setItem = this.originalLocalStorageSetItem;
        this.originalLocalStorageSetItem = null;
      } catch (error) {
        console.warn('JustUI: Could not restore localStorage.setItem:', error);
      }
    }
  }

  /**
   * Get current protection status
   * @returns {Object} Current status of all protections
   */
  getStatus() {
    return {
      isActive: this.isActive,
      localStorageMonitored: localStorage.setItem !== this.originalLocalStorageSetItem,
      intervalActive: !!this.protectionInterval
    };
  }
}
