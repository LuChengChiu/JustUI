/**
 * Unified Logger for OriginalUI Chrome Extension
 *
 * Provides structured, environment-aware logging with configurable levels.
 *
 * Features:
 * - Environment detection (development vs production)
 * - Log level filtering (ERROR, WARN, INFO, SECURITY, DEBUG)
 * - User-configurable preferences via chrome.storage
 * - Lazy evaluation for performance
 * - Structured logging with context and metadata
 * - Emoji prefixes for visual scanning
 *
 * @example
 * import Logger from '@script-utils/logger.js';
 *
 * Logger.error('StorageError', 'Failed to save settings', error, { key: 'whitelist' });
 * Logger.security('NavigationBlocked', 'Cross-origin blocked', { url, reason });
 * Logger.debug('CacheHit', 'Permission found', () => ({ cacheSize, hitRate }));
 */

/**
 * Log levels in order of severity
 * @enum {number}
 */
const LogLevel = Object.freeze({
  ERROR: 0,    // Critical errors requiring attention
  WARN: 1,     // Warnings and potential issues
  INFO: 2,     // Informational messages (operations, state changes)
  SECURITY: 3, // Security-related events (blocks, protections)
  DEBUG: 4     // Detailed debugging information (verbose)
});

/**
 * Human-readable log level names
 * @type {Object<number, string>}
 */
const LogLevelNames = Object.freeze({
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.SECURITY]: 'SECURITY',
  [LogLevel.DEBUG]: 'DEBUG'
});

/**
 * Unified Logger class (singleton)
 */
class Logger {
  /**
   * Singleton instance
   * @private
   * @type {Logger}
   */
  static #instance = null;

  /**
   * Current environment ('development' | 'production')
   * @private
   * @type {string}
   */
  #environment = 'production';

  /**
   * Current effective log level
   * @private
   * @type {number}
   */
  #currentLevel = LogLevel.INFO;

  /**
   * Whether environment detection has completed
   * @private
   * @type {boolean}
   */
  #initialized = false;

  /**
   * Per-category log level overrides
   * @private
   * @type {Map<string, number>}
   */
  #categoryLevels = new Map();

  /**
   * Get or create singleton instance
   * @returns {Logger}
   */
  static getInstance() {
    if (!Logger.#instance) {
      Logger.#instance = new Logger();
      Logger.#instance.#init();
    }
    return Logger.#instance;
  }

  /**
   * Private constructor (singleton pattern)
   * @private
   */
  constructor() {
    if (Logger.#instance) {
      throw new Error('Logger is a singleton. Use Logger.getInstance()');
    }
  }

  /**
   * Initialize logger: detect environment, load user preferences
   * @private
   */
  async #init() {
    // 1. Detect environment using chrome.management.getSelf()
    try {
      if (typeof chrome !== 'undefined' && chrome.management?.getSelf) {
        const info = await chrome.management.getSelf();
        // installType: 'development' | 'normal' | 'admin' | 'other'
        this.#environment = info.installType === 'development' ? 'development' : 'production';
      }
    } catch (error) {
      // Fallback to production mode if detection fails
      this.#environment = 'production';
    }

    // 2. Set default log level based on environment
    this.#currentLevel = this.#environment === 'development'
      ? LogLevel.DEBUG
      : LogLevel.INFO;

    // 3. Load user preferences from chrome.storage
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
        const result = await chrome.storage.local.get(['logLevel', 'logCategoryLevels']);

        if (result.logLevel !== undefined) {
          this.#currentLevel = result.logLevel;
        }

        if (result.logCategoryLevels) {
          this.#categoryLevels = new Map(Object.entries(result.logCategoryLevels));
        }
      }
    } catch (error) {
      // Silent fallback - use defaults
    }

    this.#initialized = true;

    // Log initialization (always show, regardless of level)
    console.info(`[OriginalUI Logger] Initialized in ${this.#environment} mode (level: ${LogLevelNames[this.#currentLevel]})`);
  }

  /**
   * Check if a log should be emitted based on level and category
   * @private
   * @param {number} level - Log level
   * @param {string} category - Log category
   * @returns {boolean}
   */
  #shouldLog(level, category) {
    // Check category-specific override first
    if (this.#categoryLevels.has(category)) {
      return level <= this.#categoryLevels.get(category);
    }

    // Fall back to global level
    return level <= this.#currentLevel;
  }

  /**
   * Core logging method
   * @private
   * @param {number} level - Log level
   * @param {string} emoji - Emoji prefix
   * @param {Function} consoleMethod - console.error/warn/log/info
   * @param {string} category - Log category (e.g., 'StorageError', 'NavigationBlocked')
   * @param {string} message - Human-readable message
   * @param {*} data - Additional data (Error, object, or lazy function)
   * @param {Object} metadata - Structured metadata
   */
  #log(level, emoji, consoleMethod, category, message, data = null, metadata = {}) {
    // Fast path: check if logging is enabled before any processing
    if (!this.#shouldLog(level, category)) {
      return;
    }

    // Resolve lazy evaluation
    const resolvedData = typeof data === 'function' ? data() : data;

    // Build structured log entry
    const logEntry = {
      category,
      message,
      timestamp: new Date().toISOString(),
      level: LogLevelNames[level],
      ...metadata
    };

    // Handle Error objects specially
    if (resolvedData instanceof Error) {
      logEntry.error = {
        message: resolvedData.message,
        stack: resolvedData.stack,
        name: resolvedData.name
      };
    } else if (resolvedData !== null && resolvedData !== undefined) {
      logEntry.data = resolvedData;
    }

    // Emit log with emoji prefix
    consoleMethod(`${emoji} [${category}]`, message, logEntry);
  }

  // ============================================================================
  // Public API - Static Methods
  // ============================================================================

  /**
   * Log an error (always shown, even in production)
   * @param {string} category - Error category
   * @param {string} message - Error message
   * @param {Error|*} data - Error object or additional data
   * @param {Object} metadata - Additional structured metadata
   */
  static error(category, message, data = null, metadata = {}) {
    Logger.getInstance().#log(
      LogLevel.ERROR,
      '❌',
      console.error,
      category,
      message,
      data,
      metadata
    );
  }

  /**
   * Log a warning (shown in production and development)
   * @param {string} category - Warning category
   * @param {string} message - Warning message
   * @param {*} data - Additional data (can be lazy function)
   * @param {Object} metadata - Additional structured metadata
   */
  static warn(category, message, data = null, metadata = {}) {
    Logger.getInstance().#log(
      LogLevel.WARN,
      '⚠️',
      console.warn,
      category,
      message,
      data,
      metadata
    );
  }

  /**
   * Log informational message (shown in production and development)
   * @param {string} category - Info category
   * @param {string} message - Info message
   * @param {*} data - Additional data (can be lazy function)
   * @param {Object} metadata - Additional structured metadata
   */
  static info(category, message, data = null, metadata = {}) {
    Logger.getInstance().#log(
      LogLevel.INFO,
      'ℹ️',
      console.info,
      category,
      message,
      data,
      metadata
    );
  }

  /**
   * Log security event (blocked navigation, malicious pattern, etc.)
   * @param {string} category - Security category
   * @param {string} message - Security message
   * @param {*} data - Additional data (can be lazy function)
   * @param {Object} metadata - Additional structured metadata
   */
  static security(category, message, data = null, metadata = {}) {
    Logger.getInstance().#log(
      LogLevel.SECURITY,
      '🛡️',
      console.log,
      category,
      message,
      data,
      metadata
    );
  }

  /**
   * Log debug information (only shown in development or when explicitly enabled)
   * @param {string} category - Debug category
   * @param {string} message - Debug message
   * @param {*|Function} data - Additional data or lazy function
   * @param {Object} metadata - Additional structured metadata
   */
  static debug(category, message, data = null, metadata = {}) {
    Logger.getInstance().#log(
      LogLevel.DEBUG,
      '🔍',
      console.log,
      category,
      message,
      data,
      metadata
    );
  }

  /**
   * Set global log level
   * @param {number} level - Log level from LogLevel enum
   */
  static setLevel(level) {
    const instance = Logger.getInstance();
    instance.#currentLevel = level;

    // Persist to storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      chrome.storage.local.set({ logLevel: level });
    }
  }

  /**
   * Set log level for specific category
   * @param {string} category - Category name
   * @param {number} level - Log level from LogLevel enum
   */
  static setCategoryLevel(category, level) {
    const instance = Logger.getInstance();
    instance.#categoryLevels.set(category, level);

    // Persist to storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      const categoryLevels = Object.fromEntries(instance.#categoryLevels);
      chrome.storage.local.set({ logCategoryLevels: categoryLevels });
    }
  }

  /**
   * Get current log level
   * @returns {number}
   */
  static getLevel() {
    return Logger.getInstance().#currentLevel;
  }

  /**
   * Check if debug logging is enabled
   * @returns {boolean}
   */
  static isDebugEnabled() {
    return Logger.getInstance().#currentLevel >= LogLevel.DEBUG;
  }
}

// ============================================================================
// Backward Compatibility: StorageLogger Wrapper
// ============================================================================

/**
 * StorageLogger wrapper for backward compatibility with existing chrome-api-safe.js usage
 * Delegates to Logger with Storage: prefix
 */
export const StorageLogger = {
  /**
   * Log storage error
   * @param {string} operation - Storage operation (e.g., 'safeStorageGet')
   * @param {string} context - Error context
   * @param {Error|*} error - Error object
   * @param {Object} metadata - Additional metadata
   */
  error: (operation, context, error, metadata = {}) => {
    Logger.error(`Storage:${operation}`, context, error, metadata);
  },

  /**
   * Log storage warning
   * @param {string} operation - Storage operation
   * @param {string} context - Warning context
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  warn: (operation, context, message, metadata = {}) => {
    Logger.warn(`Storage:${operation}`, context, message, metadata);
  },

  /**
   * Log storage info
   * @param {string} operation - Storage operation
   * @param {string} context - Info context
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  info: (operation, context, message, metadata = {}) => {
    Logger.info(`Storage:${operation}`, context, message, metadata);
  }
};

// Export singleton instance and utilities
export default Logger;
export { LogLevel, LogLevelNames };
