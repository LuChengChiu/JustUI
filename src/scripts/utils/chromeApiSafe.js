/**
 * Chrome API Safety Utilities
 * Provides safe access to Chrome APIs with proper error handling for extension context invalidation
 */

/**
 * Check if the Chrome extension context is still valid
 * @returns {boolean} True if extension context is valid
 */
export function isExtensionContextValid() {
  try {
    return !!(chrome?.runtime?.id);
  } catch (error) {
    return false;
  }
}

/**
 * Safely get data from Chrome storage with error handling
 * @param {string|string[]|object} keys - Storage keys to retrieve
 * @param {function} callback - Callback function (optional for Promise mode)
 * @returns {Promise|undefined} Promise if no callback provided
 */
export function safeStorageGet(keys, callback) {
  if (!isExtensionContextValid()) {
    const error = new Error('Extension context invalidated');
    if (callback) {
      callback(null, error);
      return;
    }
    return Promise.reject(error);
  }

  try {
    if (callback) {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          callback(null, chrome.runtime.lastError);
        } else {
          callback(result, null);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });
    }
  } catch (error) {
    if (callback) {
      callback(null, error);
    } else {
      return Promise.reject(error);
    }
  }
}

/**
 * Safely set data to Chrome storage with error handling and retry mechanism
 * @param {object} items - Items to store
 * @param {object} options - Options for retry behavior
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @returns {Promise<void>}
 */
export async function safeStorageSet(items, options = {}) {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  if (!isExtensionContextValid()) {
    console.warn('Chrome API Safe: Extension context invalid, skipping storage.set');
    return Promise.resolve(); // Graceful degradation - don't throw
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      return; // Success
    } catch (error) {
      console.warn(`Chrome API Safe: Storage.set attempt ${attempt} failed:`, error.message);
      
      // Check if this is a context invalidation error
      if (error.message?.includes('Extension context invalidated') || !isExtensionContextValid()) {
        console.warn('Chrome API Safe: Extension context invalidated, aborting storage operation');
        return; // Don't retry context invalidation errors
      }

      // If this is the last attempt, log the error but don't throw (graceful degradation)
      if (attempt === maxRetries) {
        console.error('Chrome API Safe: All storage.set attempts failed, data not persisted:', error);
        return;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

/**
 * Debounced storage setter to reduce API call frequency
 * @param {string} key - Unique key for this debounced operation
 * @param {object} items - Items to store
 * @param {number} delay - Debounce delay in ms (default: 500)
 * @returns {Promise<void>}
 */
export const debouncedStorageSet = (() => {
  const timeouts = new Map();
  
  return function(key, items, delay = 500) {
    return new Promise((resolve) => {
      // Clear existing timeout for this key
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key));
      }

      // Set new timeout
      const timeoutId = setTimeout(async () => {
        timeouts.delete(key);
        await safeStorageSet(items);
        resolve();
      }, delay);

      timeouts.set(key, timeoutId);
    });
  };
})();

/**
 * Safe message sending with context validation
 * @param {object} message - Message to send
 * @param {function} responseCallback - Optional response callback
 * @returns {Promise|undefined}
 */
export function safeSendMessage(message, responseCallback) {
  if (!isExtensionContextValid()) {
    const error = new Error('Extension context invalidated');
    if (responseCallback) {
      responseCallback(null, error);
      return;
    }
    return Promise.reject(error);
  }

  try {
    if (responseCallback) {
      chrome.runtime.sendMessage(message, responseCallback);
    } else {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    }
  } catch (error) {
    if (responseCallback) {
      responseCallback(null, error);
    } else {
      return Promise.reject(error);
    }
  }
}