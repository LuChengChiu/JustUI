/**
 * Rate Limiter for Background Script Operations
 * Service worker compatible with Chrome Alarms API for automatic cleanup
 *
 * @fileoverview Production-grade rate limiting with automatic cleanup that fixes
 * memory leak from unbounded Map growth. Uses Chrome Alarms API for periodic
 * cleanup, ensuring service worker compatibility.
 *
 * @example
 * // Use singleton instance
 * if (!rateLimiter.checkLimit('updateWhitelist', sender)) {
 *   return { success: false, error: 'Rate limit exceeded' };
 * }
 *
 * @example
 * // Get statistics for monitoring
 * const stats = rateLimiter.getStats();
 * Logger.info('RateLimiterStats', 'Rate limiter stats', stats);
 *
 * @module RateLimiter
 * @since 1.0.0
 * @author OriginalUI Team
 */
import Logger from "../logger.js";

/**
 * RateLimiter class for request throttling with automatic cleanup
 * @class
 */
export class RateLimiter {
  /**
   * Create rate limiter instance
   * @param {Object} config - Configuration options
   * @param {number} config.maxCallsPerWindow - Max calls per time window (default: 30)
   * @param {number} config.windowMs - Time window in milliseconds (default: 60000)
   * @param {number} config.maxEntries - Maximum cache entries safety limit (default: 100)
   * @param {number} config.cleanupIntervalMinutes - Cleanup interval in minutes (default: 5)
   */
  constructor(config = {}) {
    this.maxCallsPerWindow = config.maxCallsPerWindow || 30;
    this.windowMs = config.windowMs || 60000; // 1 minute
    this.maxEntries = config.maxEntries || 100;
    this.cleanupIntervalMinutes = config.cleanupIntervalMinutes || 5;
    this.limits = new Map();
    this.stats = { totalChecks: 0, blocked: 0, allowed: 0 };

    // Setup Chrome Alarms API for periodic cleanup (service worker compatible)
    this._setupCleanupAlarm();

    Logger.info('RateLimiterInit', 'RateLimiter initialized', {
      maxCallsPerWindow: this.maxCallsPerWindow,
      windowMs: this.windowMs,
      cleanupIntervalMinutes: this.cleanupIntervalMinutes
    });
  }

  /**
   * Check if action is within rate limit
   * @param {string} action - Action identifier (e.g., 'updateWhitelist')
   * @param {object} sender - Chrome message sender object
   * @returns {boolean} True if within limit, false if exceeded
   *
   * @example
   * if (!rateLimiter.checkLimit('updateWhitelist', sender)) {
   *   Logger.warn('RateLimiterExceeded', 'Rate limit exceeded');
   *   return false;
   * }
   */
  checkLimit(action, sender) {
    const key = `${action}-${sender.id}-${sender.url}`;
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Initialize key if needed
    if (!this.limits.has(key)) {
      this.limits.set(key, []);
    }

    const calls = this.limits.get(key);

    // Remove stale timestamps using efficient in-place filtering
    // PERFORMANCE: This is more efficient than creating new array with filter()
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < calls.length; readIndex++) {
      if (calls[readIndex] >= cutoff) {
        calls[writeIndex++] = calls[readIndex];
      }
    }
    calls.length = writeIndex;

    this.stats.totalChecks++;

    // Check rate limit
    if (calls.length >= this.maxCallsPerWindow) {
      Logger.warn('RateLimiterExceeded', 'Rate limit exceeded', {
        action,
        senderUrl: sender.url
      });
      this.stats.blocked++;
      return false;
    }

    // Add new timestamp
    calls.push(now);
    this.stats.allowed++;

    // Proactive cleanup when threshold reached (safety measure)
    if (this.limits.size > this.maxEntries) {
      this._cleanupOldEntries();
    }

    return true;
  }

  /**
   * Setup Chrome Alarms API for periodic cleanup (service worker compatible)
   * @private
   */
  _setupCleanupAlarm() {
    const alarmName = 'rateLimiterCleanup';

    // Create alarm for cleanup every N minutes (persists across service worker restarts)
    chrome.alarms.create(alarmName, {
      periodInMinutes: this.cleanupIntervalMinutes
    });

    // Register alarm listener
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === alarmName) {
        this._cleanupOldEntries();
      }
    });
  }

  /**
   * Cleanup old entries based on time window
   * FIX: This removes ALL expired entries, not just one (fixes memory leak)
   * @private
   */
  _cleanupOldEntries() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const keysToDelete = [];

    for (const [key, calls] of this.limits.entries()) {
      // Remove stale timestamps in-place
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < calls.length; readIndex++) {
        if (calls[readIndex] >= cutoff) {
          calls[writeIndex++] = calls[readIndex];
        }
      }
      calls.length = writeIndex;

      // Mark key for deletion if no recent activity
      if (calls.length === 0) {
        keysToDelete.push(key);
      }
    }

    // Remove inactive keys
    keysToDelete.forEach(key => this.limits.delete(key));

    if (keysToDelete.length > 0) {
      Logger.info('RateLimiterCleanup', 'Rate limiter cleanup completed', {
        removedKeys: keysToDelete.length,
        remainingKeys: this.limits.size
      });
    }
  }

  /**
   * Get current statistics for monitoring and debugging
   * @returns {Object} Stats object with totalChecks, blocked, allowed, currentEntries
   *
   * @example
   * const stats = rateLimiter.getStats();
   * Logger.info('RateLimiterStats', 'Rate limiter stats', stats);
   */
  getStats() {
    return {
      ...this.stats,
      currentEntries: this.limits.size,
      maxEntries: this.maxEntries,
      windowMs: this.windowMs,
      maxCallsPerWindow: this.maxCallsPerWindow
    };
  }

  /**
   * Reset rate limiter state (primarily for testing)
   */
  reset() {
    this.limits.clear();
    this.stats = { totalChecks: 0, blocked: 0, allowed: 0 };
    Logger.info('RateLimiterReset', 'Rate limiter reset');
  }

  /**
   * Cleanup method for graceful shutdown
   * Clears Chrome Alarm and internal state
   */
  cleanup() {
    chrome.alarms.clear('rateLimiterCleanup');
    this.limits.clear();
    Logger.info('RateLimiterCleanup', 'Rate limiter cleaned up');
  }
}

/**
 * Singleton instance for background script
 * Use this exported instance throughout the background script
 * @type {RateLimiter}
 */
export const rateLimiter = new RateLimiter();
