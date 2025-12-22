/**
 * Chrome API Safety Utilities
 * Provides safe access to Chrome APIs with proper error handling for extension context invalidation
 */

/**
 * Logger utility for structured error reporting
 */
const StorageLogger = {
  error: (operation, context, error, metadata = {}) => {
    console.error(`JustUI Storage Error [${operation}]:`, {
      context,
      error: error.message || error,
      timestamp: new Date().toISOString(),
      extensionContext: isExtensionContextValid(),
      ...metadata
    });
  },
  
  warn: (operation, context, message, metadata = {}) => {
    console.warn(`JustUI Storage Warning [${operation}]:`, {
      context,
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  },
  
  info: (operation, context, message, metadata = {}) => {
    console.info(`JustUI Storage Info [${operation}]:`, {
      context,
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }
};

/**
 * Check if the Chrome extension context is still valid
 * @returns {boolean} True if extension context is valid
 */
export function isExtensionContextValid() {
  try {
    // Check if chrome.runtime exists and has an id
    if (!chrome?.runtime?.id) {
      return false;
    }
    
    // Additional check: try to access chrome.storage to ensure full context validity
    if (!chrome?.storage?.local) {
      return false;
    }
    
    return true;
  } catch (error) {
    // Any error accessing chrome APIs indicates invalid context
    return false;
  }
}

/**
 * Safely get data from Chrome storage with error handling and retry capability
 * @param {string|string[]|object} keys - Storage keys to retrieve
 * @param {function} callback - Callback function (optional for Promise mode)
 * @param {object} options - Options for retry behavior
 * @param {number} options.maxRetries - Maximum number of retries (default: 1)
 * @returns {Promise|undefined} Promise if no callback provided
 */
export function safeStorageGet(keys, callback, options = {}) {
  const { maxRetries = 1 } = options;
  
  if (!isExtensionContextValid()) {
    const error = new Error('Extension context invalidated');
    if (callback) {
      callback(null, error);
      return;
    }
    return Promise.reject(error);
  }

  const attemptGet = async (attempt = 1) => {
    try {
      if (callback) {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            if (attempt <= maxRetries && isRetryableError(chrome.runtime.lastError)) {
              setTimeout(() => attemptGet(attempt + 1), 50 * attempt);
            } else {
              callback(null, chrome.runtime.lastError);
            }
          } else {
            callback(result, null);
          }
        });
      } else {
        return new Promise((resolve, reject) => {
          chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
              if (attempt <= maxRetries && isRetryableError(chrome.runtime.lastError)) {
                setTimeout(async () => {
                  try {
                    const retryResult = await attemptGet(attempt + 1);
                    resolve(retryResult);
                  } catch (retryError) {
                    reject(retryError);
                  }
                }, 50 * attempt);
              } else {
                reject(chrome.runtime.lastError);
              }
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
  };

  return attemptGet();
}

/**
 * Check if an error is retryable based on its characteristics
 * @param {Error} error - The error to check
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  
  // Non-retryable errors (context/permission issues)
  if (errorMessage.includes('extension context invalidated') ||
      errorMessage.includes('cannot access') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('invalid invocation')) {
    return false;
  }
  
  // Retryable errors (transient issues)
  if (errorMessage.includes('quota') ||
      errorMessage.includes('disk') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('temporarily unavailable')) {
    return true;
  }
  
  // Default: try once for unknown errors
  return true;
}

/**
 * Safely set data to Chrome storage with error handling and retry mechanism
 * @param {object} items - Items to store
 * @param {object} options - Options for retry behavior
 * @param {number} options.maxRetries - Maximum number of retries (default: 2)
 * @param {number} options.retryDelay - Base delay between retries in ms (default: 100)
 * @param {boolean} options.validateWrite - Whether to validate write success (default: false)
 * @returns {Promise<void>}
 */
export async function safeStorageSet(items, options = {}) {
  const { maxRetries = 2, retryDelay = 100, validateWrite = false } = options;

  if (!isExtensionContextValid()) {
    StorageLogger.warn('storage-set', 'context-invalid', 'Extension context invalid, skipping operation');
    return Promise.resolve(); // Graceful degradation - don't throw
  }

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
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
      
      // Optional validation: verify the write actually succeeded
      if (validateWrite) {
        const keys = Object.keys(items);
        const result = await safeStorageGet(keys);
        const writeSucceeded = keys.every(key => 
          JSON.stringify(result[key]) === JSON.stringify(items[key])
        );
        if (!writeSucceeded) {
          throw new Error('Write validation failed: data inconsistency detected');
        }
      }
      
      return; // Success
    } catch (error) {
      const isLastAttempt = attempt === maxRetries + 1;
      
      StorageLogger.warn('storage-set', 'retry-attempt', `Attempt ${attempt}/${maxRetries + 1} failed`, {
        error: error.message,
        retryable: isRetryableError(error),
        itemKeys: Object.keys(items),
        attempt
      });
      
      // Check if this is a context invalidation error or non-retryable
      if (!isExtensionContextValid() || !isRetryableError(error)) {
        StorageLogger.info('storage-set', 'non-retryable', 'Aborting due to non-retryable error', {
          error: error.message,
          contextValid: isExtensionContextValid()
        });
        return; // Don't retry non-retryable errors
      }

      // If this is the last attempt, log the error but don't throw (graceful degradation)
      if (isLastAttempt) {
        StorageLogger.error('storage-set', 'final-failure', error, {
          itemKeys: Object.keys(items),
          totalAttempts: attempt
        });
        return;
      }

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1)));
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
  const MAX_ENTRIES = 100;
  
  const cleanupTimeout = (key) => {
    if (timeouts.has(key)) {
      clearTimeout(timeouts.get(key));
      timeouts.delete(key);
    }
  };
  
  return function(key, items, delay = 500) {
    return new Promise((resolve) => {
      // Clear existing timeout for this key
      cleanupTimeout(key);

      // Prevent unbounded growth by removing oldest entries
      if (timeouts.size >= MAX_ENTRIES) {
        const firstKey = timeouts.keys().next().value;
        cleanupTimeout(firstKey);
        console.warn(`JustUI: debouncedStorageSet map reached max size (${MAX_ENTRIES}), removed oldest entry`);
      }

      // Set new timeout
      const timeoutId = setTimeout(async () => {
        // Ensure cleanup happens regardless of success/failure
        const cleanup = () => cleanupTimeout(key);
        
        try {
          await safeStorageSet(items);
          cleanup();
          resolve();
        } catch (error) {
          cleanup();
          console.warn('JustUI: debouncedStorageSet failed:', error);
          resolve(); // Still resolve to prevent hanging promises
        }
      }, delay);

      timeouts.set(key, timeoutId);
    });
  };
})();

/**
 * Validate that critical storage operations actually succeeded
 * @param {object} expectedItems - Items that should have been stored
 * @param {string[]} criticalKeys - Keys that must be validated (subset of expectedItems keys)
 * @returns {Promise<{success: boolean, inconsistencies: string[]}>}
 */
export async function validateStorageState(expectedItems, criticalKeys = []) {
  if (!isExtensionContextValid()) {
    return { success: false, inconsistencies: ['Extension context invalid'] };
  }

  try {
    const keysToCheck = criticalKeys.length > 0 ? criticalKeys : Object.keys(expectedItems);
    const actualResult = await safeStorageGet(keysToCheck);
    const inconsistencies = [];

    for (const key of keysToCheck) {
      const expected = expectedItems[key];
      const actual = actualResult[key];
      
      // Deep comparison for objects and arrays
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        inconsistencies.push(`${key}: expected ${JSON.stringify(expected)?.substring(0, 100)}..., got ${JSON.stringify(actual)?.substring(0, 100)}...`);
      }
    }

    return {
      success: inconsistencies.length === 0,
      inconsistencies
    };
  } catch (error) {
    return {
      success: false,
      inconsistencies: [`Validation failed: ${error.message}`]
    };
  }
}

/**
 * Safely set critical data with validation and recovery
 * @param {object} items - Items to store
 * @param {string[]} criticalKeys - Keys that must be validated after storage
 * @param {object} options - Storage options plus validation options
 * @param {boolean} options.requireValidation - Whether validation is mandatory (default: true)
 * @returns {Promise<{success: boolean, validationResult?: object}>}
 */
export async function safeStorageSetWithValidation(items, criticalKeys = [], options = {}) {
  const { requireValidation = true, ...storageOptions } = options;
  
  try {
    // Attempt storage with validation enabled
    await safeStorageSet(items, { ...storageOptions, validateWrite: requireValidation });
    
    // Additional validation for critical keys if specified
    if (criticalKeys.length > 0) {
      const validationResult = await validateStorageState(items, criticalKeys);
      if (!validationResult.success) {
        StorageLogger.error('storage-validation', 'critical-failure', 'Validation failed', {
          inconsistencies: validationResult.inconsistencies,
          criticalKeys
        });
        if (requireValidation) {
          // Attempt one recovery by re-storing critical items
          const criticalItems = {};
          criticalKeys.forEach(key => {
            if (items.hasOwnProperty(key)) {
              criticalItems[key] = items[key];
            }
          });
          
          StorageLogger.warn('storage-recovery', 'attempting', 'Recovering critical storage items', {
            criticalKeys,
            itemsToRecover: Object.keys(criticalItems)
          });
          await safeStorageSet(criticalItems, storageOptions);
          
          // Re-validate
          const recoveryValidation = await validateStorageState(criticalItems, criticalKeys);
          return { success: recoveryValidation.success, validationResult: recoveryValidation };
        }
      }
      return { success: validationResult.success, validationResult };
    }
    
    return { success: true };
  } catch (error) {
    StorageLogger.error('storage-critical', 'operation-failed', error, {
      criticalKeys,
      operation: 'safeStorageSetWithValidation'
    });
    return { success: false, error: error.message };
  }
}

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