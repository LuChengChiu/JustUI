/**
 * Chrome API Safety Utilities - Production-grade Chrome extension API safety layer
 *
 * @fileoverview Provides comprehensive safety layer for Chrome extension APIs with advanced
 * error handling, circuit breaker pattern, exponential backoff retry mechanisms, and context
 * validation. Designed for production stability and resilience against Chrome API failures.
 *
 * @example
 * // Safe storage operations
 * const data = await safeStorageGet(['settings', 'whitelist']);
 * await safeStorageSet({ lastSync: Date.now() });
 *
 * @example
 * // Safe message passing
 * const response = await safeSendMessage({ action: 'getData' });
 *
 * @example
 * // Circuit breaker monitoring
 * const stats = getCircuitBreakerStats();
 * StorageLogger.info('circuit-breaker', 'stats', 'Storage circuit state', {
 *   state: stats.storage.state
 * });
 *
 * @module chromeApiSafe
 * @since 1.0.0
 * @author OriginalUI Team
 */

import Logger, { StorageLogger } from './logger.js';

/**
 * Circuit breaker states for API protection
 * @readonly
 * @enum {string}
 * @property {string} CLOSED - Normal operation, requests allowed
 * @property {string} OPEN - Circuit open, failing fast to prevent cascade failures
 * @property {string} HALF_OPEN - Testing recovery, limited requests allowed
 */
const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Circuit open, failing fast
  HALF_OPEN: 'half_open' // Testing if service recovered
};

/**
 * Circuit breaker configuration parameters
 * @readonly
 * @type {Object}
 * @property {number} failureThreshold - Number of failures before opening circuit
 * @property {number} recoveryTimeout - Time in ms before attempting recovery
 * @property {number} successThreshold - Successes needed in half-open to close circuit
 * @property {number} monitoringPeriod - Time window for failure counting
 */
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // Failures before opening circuit
  recoveryTimeout: 30000,     // Time before trying half-open (30s)
  successThreshold: 3,        // Successes needed in half-open to close
  monitoringPeriod: 60000     // Time window for failure counting (1 min)
};

/**
 * Circuit breaker implementation for Chrome API operations
 * @class
 * @private
 */
class CircuitBreaker {
  /**
   * Create a circuit breaker instance
   * @param {string} name - Circuit breaker identifier
   * @param {Object} [config=CIRCUIT_BREAKER_CONFIG] - Configuration parameters
   */
  constructor(name, config = CIRCUIT_BREAKER_CONFIG) {
    /** @type {string} Circuit breaker name */
    this.name = name;
    /** @type {Object} Circuit breaker configuration */
    this.config = { ...config };
    /** @type {string} Current state of the circuit breaker */
    this.state = CIRCUIT_BREAKER_STATES.CLOSED;
    /** @type {number} Current failure count */
    this.failures = 0;
    /** @type {number} Current success count in half-open state */
    this.successes = 0;
    /** @type {number|null} Timestamp of last failure */
    this.lastFailureTime = null;
    /** @type {number|null} Timestamp when next attempt is allowed */
    this.nextAttemptTime = null;
    /** @type {Array<Object>} Recent operation history for monitoring */
    this.recentOperations = [];
  }
  
  /**
   * Execute operation with circuit breaker protection
   * @param {Function} operation - Async operation to execute
   * @returns {Promise<*>} Operation result or throws circuit breaker error
   * @throws {Error} When circuit is open or operation fails
   * 
   * @example
   * const result = await circuitBreaker.execute(async () => {
   *   return await chrome.storage.local.get(['settings']);
   * });
   */
  async execute(operation) {
    if (this.state === CIRCUIT_BREAKER_STATES.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker OPEN for ${this.name} (retry in ${this.nextAttemptTime - Date.now()}ms)`);
      }
      this.state = CIRCUIT_BREAKER_STATES.HALF_OPEN;
      this.successes = 0;
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }
  
  /**
   * Handle successful operation
   */
  onSuccess() {
    this.failures = 0;
    this.recentOperations.push({ success: true, timestamp: Date.now() });
    this.cleanOldOperations();
    
    if (this.state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CIRCUIT_BREAKER_STATES.CLOSED;
        StorageLogger.info('circuit-breaker', this.name, 'Circuit breaker closed - service recovered');
      }
    }
  }
  
  /**
   * Handle failed operation
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.recentOperations.push({ success: false, timestamp: Date.now(), error: error.message });
    this.cleanOldOperations();
    
    if (this.state === CIRCUIT_BREAKER_STATES.HALF_OPEN || this.failures >= this.config.failureThreshold) {
      this.state = CIRCUIT_BREAKER_STATES.OPEN;
      this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
      StorageLogger.warn('circuit-breaker', this.name, `Circuit breaker opened after ${this.failures} failures`);
    }
  }
  
  /**
   * Clean old operations from monitoring window
   */
  cleanOldOperations() {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.recentOperations = this.recentOperations.filter(op => op.timestamp > cutoff);
  }
  
  /**
   * Get circuit breaker statistics
   * @returns {object} Statistics
   */
  getStats() {
    this.cleanOldOperations();
    const recentFailures = this.recentOperations.filter(op => !op.success).length;
    const recentSuccesses = this.recentOperations.filter(op => op.success).length;
    
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      recentOperations: this.recentOperations.length,
      recentFailures,
      recentSuccesses,
      failureRate: this.recentOperations.length > 0 ? 
        (recentFailures / this.recentOperations.length * 100).toFixed(1) + '%' : '0%',
      nextAttemptTime: this.nextAttemptTime,
      timeToRecoveryAttempt: this.nextAttemptTime ? Math.max(0, this.nextAttemptTime - Date.now()) : 0
    };
  }
  
  /**
   * Force reset the circuit breaker
   */
  reset() {
    this.state = CIRCUIT_BREAKER_STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.recentOperations = [];
    StorageLogger.info('circuit-breaker', this.name, 'Circuit breaker manually reset');
  }
}

/**
 * Circuit breakers for different Chrome API operations
 */
const circuitBreakers = {
  storage: new CircuitBreaker('chrome.storage', {
    ...CIRCUIT_BREAKER_CONFIG,
    failureThreshold: 3, // Storage is more critical
    recoveryTimeout: 15000 // Faster recovery
  }),
  messaging: new CircuitBreaker('chrome.messaging', CIRCUIT_BREAKER_CONFIG),
  tabs: new CircuitBreaker('chrome.tabs', CIRCUIT_BREAKER_CONFIG)
};

/**
 * Get circuit breaker for operation type
 * @param {string} operationType - Type of operation
 * @returns {CircuitBreaker} Circuit breaker instance
 */
function getCircuitBreaker(operationType) {
  return circuitBreakers[operationType] || circuitBreakers.storage;
}

/**
 * StorageLogger is now imported from logger.js for backward compatibility
 * See src/scripts/utils/logger.js for the unified Logger implementation
 */

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
 * Enhanced safe storage get with circuit breaker protection and exponential backoff
 * @param {string|string[]|object} keys - Storage keys to retrieve
 * @param {function} callback - Callback function (optional for Promise mode)
 * @param {object} options - Enhanced options for retry behavior
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay for exponential backoff (default: 100ms)
 * @param {boolean} options.useCircuitBreaker - Use circuit breaker protection (default: true)
 * @returns {Promise|undefined} Promise if no callback provided
 */
export function safeStorageGet(keys, callback, options = {}) {
  const { 
    maxRetries = 3, 
    baseDelay = 100,
    useCircuitBreaker = true
  } = options;
  
  if (!isExtensionContextValid()) {
    const error = new Error('Extension context invalidated');
    StorageLogger.warn('storage-get', 'context-invalid', 'Extension context invalid during storage get', { keys });
    if (callback) {
      callback(null, error);
      return;
    }
    return Promise.reject(error);
  }

  const attemptGet = async (attempt = 1) => {
    const operation = async () => {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(result);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    };
    
    try {
      let result;
      
      if (useCircuitBreaker) {
        result = await getCircuitBreaker('storage').execute(operation);
      } else {
        result = await operation();
      }
      
      StorageLogger.info('storage-get', 'success', `Retrieved storage keys on attempt ${attempt}`, {
        keys: Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys),
        attempt,
        resultSize: Object.keys(result).length
      });
      
      if (callback) {
        callback(result, null);
        return;
      }
      return result;
      
    } catch (error) {
      const errorClassification = classifyError(error);
      
      StorageLogger.warn('storage-get', 'attempt-failed', `Attempt ${attempt} failed`, {
        keys,
        attempt,
        error: error.message,
        classification: errorClassification
      });
      
      // Check if we should retry
      if (attempt <= maxRetries && errorClassification.isRetryable) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100; // Exponential backoff with jitter
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptGet(attempt + 1);
      }
      
      // Final failure
      StorageLogger.error('storage-get', 'final-failure', error, {
        keys,
        totalAttempts: attempt,
        classification: errorClassification
      });
      
      if (callback) {
        callback(null, error);
        return;
      }
      throw error;
    }
  };

  return attemptGet();
}

/**
 * Enhanced error classification with detailed categorization
 * @param {Error} error - The error to check
 * @returns {object} Error classification result
 */
function classifyError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  
  const classification = {
    isRetryable: false,
    category: 'unknown',
    severity: 'medium',
    recommendedDelay: 1000,
    circuitBreakerImpact: true
  };
  
  // Critical non-retryable errors (should not count against circuit breaker)
  if (errorMessage.includes('extension context invalidated') ||
      errorMessage.includes('cannot access') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('invalid invocation')) {
    classification.category = 'context';
    classification.severity = 'critical';
    classification.circuitBreakerImpact = false;
    return classification;
  }
  
  // Quota/resource errors (retryable with longer delays)
  if (errorMessage.includes('quota') ||
      errorMessage.includes('storage quota') ||
      errorMessage.includes('disk full')) {
    classification.isRetryable = true;
    classification.category = 'quota';
    classification.severity = 'high';
    classification.recommendedDelay = 5000;
    return classification;
  }
  
  // Network/transient errors (retryable with normal delays)
  if (errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('service unavailable')) {
    classification.isRetryable = true;
    classification.category = 'network';
    classification.severity = 'medium';
    classification.recommendedDelay = 1000;
    return classification;
  }
  
  // Rate limiting errors
  if (errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')) {
    classification.isRetryable = true;
    classification.category = 'rate_limit';
    classification.severity = 'medium';
    classification.recommendedDelay = 2000;
    return classification;
  }
  
  // Unknown errors - conservative approach
  classification.isRetryable = true;
  classification.severity = 'low';
  classification.recommendedDelay = 500;
  
  return classification;
}

/**
 * Check if an error is retryable (backward compatibility)
 * @param {Error} error - The error to check
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  return classifyError(error).isRetryable;
}

/**
 * Enhanced safe storage set with circuit breaker protection and improved error handling
 * @param {object} items - Items to store
 * @param {object} options - Enhanced options for retry behavior
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay for exponential backoff (default: 100ms)
 * @param {boolean} options.validateWrite - Whether to validate write success (default: false)
 * @param {boolean} options.useCircuitBreaker - Use circuit breaker protection (default: true)
 * @param {number} options.maxItemSize - Maximum size per item in bytes (default: 8192)
 * @returns {Promise<void>}
 */
export async function safeStorageSet(items, options = {}) {
  const { 
    maxRetries = 3, 
    baseDelay = 100, 
    validateWrite = false,
    useCircuitBreaker = true,
    maxItemSize = 8192
  } = options;

  if (!isExtensionContextValid()) {
    StorageLogger.warn('storage-set', 'context-invalid', 'Extension context invalid, skipping operation', {
      itemKeys: Object.keys(items)
    });
    return Promise.resolve(); // Graceful degradation - don't throw
  }
  
  // Validate item sizes
  const oversizedItems = [];
  for (const [key, value] of Object.entries(items)) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > maxItemSize) {
        oversizedItems.push({ key, size: serialized.length });
      }
    } catch (error) {
      // Circular references or other serialization failures indicate a bug
      StorageLogger.error(
        'storage-set',
        'serialization-failed',
        error,
        {
          key,
          valueType: typeof value
        }
      );
      throw error; // Re-throw to fail fast - don't hide bugs
    }
  }
  
  if (oversizedItems.length > 0) {
    StorageLogger.warn('storage-set', 'oversized-items', 'Some items exceed size limits', {
      oversizedItems,
      maxItemSize
    });
  }

  const operation = async () => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  };
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // Execute through circuit breaker if enabled
      if (useCircuitBreaker) {
        await getCircuitBreaker('storage').execute(operation);
      } else {
        await operation();
      }
      
      // Optional validation: verify the write actually succeeded
      if (validateWrite) {
        const keys = Object.keys(items);
        const result = await safeStorageGet(keys, null, { useCircuitBreaker });
        const writeSucceeded = keys.every(key => {
          try {
            return JSON.stringify(result[key]) === JSON.stringify(items[key]);
          } catch (e) {
            return false;
          }
        });
        if (!writeSucceeded) {
          throw new Error('Write validation failed: data inconsistency detected');
        }
      }
      
      StorageLogger.info('storage-set', 'success', `Storage set successful on attempt ${attempt}`, {
        itemKeys: Object.keys(items),
        attempt,
        validated: validateWrite
      });
      
      return; // Success
      
    } catch (error) {
      const isLastAttempt = attempt === maxRetries + 1;
      const errorClassification = classifyError(error);
      
      StorageLogger.warn('storage-set', 'retry-attempt', `Attempt ${attempt}/${maxRetries + 1} failed`, {
        error: error.message,
        classification: errorClassification,
        itemKeys: Object.keys(items),
        attempt
      });
      
      // Check if this is a context invalidation error or non-retryable
      if (!isExtensionContextValid() || !errorClassification.isRetryable) {
        StorageLogger.info('storage-set', 'non-retryable', 'Aborting due to non-retryable error', {
          error: error.message,
          contextValid: isExtensionContextValid(),
          classification: errorClassification
        });
        return; // Don't retry non-retryable errors
      }

      // If this is the last attempt, log the error but don't throw (graceful degradation)
      if (isLastAttempt) {
        StorageLogger.error('storage-set', 'final-failure', error, {
          itemKeys: Object.keys(items),
          totalAttempts: attempt,
          classification: errorClassification
        });
        return;
      }

      // Wait before retrying with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
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
        StorageLogger.warn(
          'storage-set',
          'debounced-max-entries',
          `debouncedStorageSet map reached max size (${MAX_ENTRIES}), removed oldest entry`
        );
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
          StorageLogger.warn('storage-set', 'debounced-failed', 'debouncedStorageSet failed', {
            error: error.message
          });
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
      // Cache stringified results to avoid duplicate serialization (50% reduction)
      const expectedStr = JSON.stringify(expected);
      const actualStr = JSON.stringify(actual);

      if (expectedStr !== actualStr) {
        inconsistencies.push(`${key}: expected ${expectedStr?.substring(0, 100)}..., got ${actualStr?.substring(0, 100)}...`);
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
 * Enhanced critical storage operations with comprehensive validation and recovery
 * @param {object} items - Items to store
 * @param {string[]} criticalKeys - Keys that must be validated after storage
 * @param {object} options - Enhanced storage options plus validation options
 * @param {boolean} options.requireValidation - Whether validation is mandatory (default: true)
 * @param {number} options.maxRecoveryAttempts - Maximum recovery attempts (default: 2)
 * @param {boolean} options.enableCheckpointing - Create checkpoints before operations (default: true)
 * @returns {Promise<{success: boolean, validationResult?: object, recoveryAttempts?: number}>}
 */
export async function safeStorageSetWithValidation(items, criticalKeys = [], options = {}) {
  const { 
    requireValidation = true, 
    maxRecoveryAttempts = 2,
    enableCheckpointing = true,
    ...storageOptions 
  } = options;
  
  let recoveryAttempts = 0;
  let checkpoint = null;
  
  try {
    // Create checkpoint if enabled
    if (enableCheckpointing && criticalKeys.length > 0) {
      try {
        checkpoint = await safeStorageGet(criticalKeys);
        StorageLogger.info('storage-checkpoint', 'created', 'Created storage checkpoint', {
          keys: criticalKeys,
          checkpointSize: Object.keys(checkpoint).length
        });
      } catch (error) {
        StorageLogger.warn('storage-checkpoint', 'failed', 'Could not create checkpoint', {
          error: error.message,
          keys: criticalKeys
        });
      }
    }
    
    // Attempt storage with validation enabled
    await safeStorageSet(items, { 
      ...storageOptions, 
      validateWrite: requireValidation,
      useCircuitBreaker: true 
    });
    
    // Additional validation for critical keys if specified
    if (criticalKeys.length > 0) {
      let validationResult = await validateStorageState(items, criticalKeys);
      
      // Recovery loop if validation fails
      while (!validationResult.success && recoveryAttempts < maxRecoveryAttempts) {
        recoveryAttempts++;
        
        StorageLogger.warn('storage-recovery', 'attempting', `Recovery attempt ${recoveryAttempts}`, {
          inconsistencies: validationResult.inconsistencies,
          criticalKeys,
          attempt: recoveryAttempts
        });
        
        if (requireValidation) {
          // Attempt recovery by re-storing critical items
          const criticalItems = {};
          criticalKeys.forEach(key => {
            if (items.hasOwnProperty(key)) {
              criticalItems[key] = items[key];
            }
          });
          
          // Use enhanced retry options for recovery
          await safeStorageSet(criticalItems, {
            ...storageOptions,
            maxRetries: 5, // More aggressive retries for recovery
            validateWrite: true,
            useCircuitBreaker: false // Bypass circuit breaker for recovery
          });
          
          // Re-validate
          validationResult = await validateStorageState(criticalItems, criticalKeys);
          
          if (validationResult.success) {
            StorageLogger.info('storage-recovery', 'success', `Recovery successful on attempt ${recoveryAttempts}`);
            break;
          }
        } else {
          break; // Don't retry if validation not required
        }
      }
      
      // If recovery failed and we have a checkpoint, consider restoring it
      if (!validationResult.success && checkpoint && recoveryAttempts >= maxRecoveryAttempts) {
        StorageLogger.error('storage-recovery', 'checkpoint-restore', 'Considering checkpoint restoration', {
          checkpoint: Object.keys(checkpoint),
          finalValidationResult: validationResult
        });
        
        // Note: Automatic checkpoint restoration could be risky, so just log for now
        // In a real scenario, you might want to restore the checkpoint or alert the user
      }
      
      return { 
        success: validationResult.success, 
        validationResult,
        recoveryAttempts,
        checkpointAvailable: checkpoint !== null
      };
    }
    
    return { success: true, recoveryAttempts };
    
  } catch (error) {
    StorageLogger.error('storage-critical', 'operation-failed', error, {
      criticalKeys,
      operation: 'safeStorageSetWithValidation',
      recoveryAttempts,
      checkpointAvailable: checkpoint !== null
    });
    
    return { 
      success: false, 
      error: error.message,
      recoveryAttempts,
      checkpointAvailable: checkpoint !== null
    };
  }
}

/**
 * Enhanced safe message sending with circuit breaker protection and retry logic
 * @param {object} message - Message to send
 * @param {function} responseCallback - Optional response callback
 * @param {object} options - Messaging options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 2)
 * @param {number} options.baseDelay - Base delay for retries (default: 200ms)
 * @param {boolean} options.useCircuitBreaker - Use circuit breaker (default: true)
 * @returns {Promise|undefined}
 */
export function safeSendMessage(message, responseCallback, options = {}) {
  const {
    maxRetries = 2,
    baseDelay = 200,
    useCircuitBreaker = true
  } = options;
  
  if (!isExtensionContextValid()) {
    const error = new Error('Extension context invalidated');
    StorageLogger.warn('messaging', 'context-invalid', 'Extension context invalid during messaging', { message });
    if (responseCallback) {
      responseCallback(null, error);
      return;
    }
    return Promise.reject(error);
  }

  const attemptSend = async (attempt = 1) => {
    const operation = async () => {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    };
    
    try {
      let result;
      
      if (useCircuitBreaker) {
        result = await getCircuitBreaker('messaging').execute(operation);
      } else {
        result = await operation();
      }
      
      StorageLogger.info('messaging', 'success', `Message sent successfully on attempt ${attempt}`, {
        messageType: message.action || 'unknown',
        attempt
      });
      
      if (responseCallback) {
        responseCallback(result, null);
        return;
      }
      return result;
      
    } catch (error) {
      const errorClassification = classifyError(error);
      
      StorageLogger.warn('messaging', 'attempt-failed', `Send attempt ${attempt} failed`, {
        messageType: message.action || 'unknown',
        attempt,
        error: error.message,
        classification: errorClassification
      });
      
      // Check if we should retry
      if (attempt <= maxRetries && errorClassification.isRetryable) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptSend(attempt + 1);
      }
      
      // Final failure
      StorageLogger.error('messaging', 'final-failure', error, {
        messageType: message.action || 'unknown',
        totalAttempts: attempt,
        classification: errorClassification
      });
      
      if (responseCallback) {
        responseCallback(null, error);
        return;
      }
      throw error;
    }
  };

  return attemptSend();
}

/**
 * Get circuit breaker statistics for monitoring
 * @returns {object} Circuit breaker statistics
 */
export function getCircuitBreakerStats() {
  const stats = {};
  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    stats[name] = breaker.getStats();
  }
  return stats;
}

/**
 * Reset all circuit breakers (for testing or recovery)
 */
export function resetCircuitBreakers() {
  for (const breaker of Object.values(circuitBreakers)) {
    breaker.reset();
  }
  StorageLogger.info('circuit-breaker', 'reset-all', 'All circuit breakers reset');
}

/**
 * Get comprehensive Chrome API safety statistics
 * @returns {object} Complete statistics
 */
export function getChromeApiSafetyStats() {
  return {
    contextValid: isExtensionContextValid(),
    circuitBreakers: getCircuitBreakerStats(),
    timestamp: new Date().toISOString()
  };
}
