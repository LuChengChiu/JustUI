/**
 * Performance Coordinator
 *
 * @fileoverview Manages time-slicing and performance optimization for rule execution.
 * Prevents UI jank by yielding to main thread periodically.
 *
 * @module performance-coordinator
 */

import Logger from "@script-utils/logger.js";

/**
 * Coordinates performance optimizations for rule execution
 */
export class PerformanceCoordinator {
  /**
   * @param {object} config - Configuration options
   * @param {number} [config.maxFrameTime=16] - Target frame time in ms (60fps)
   * @param {number} [config.batchSize=50] - Items to process per batch
   * @param {boolean} [config.enableTimeSlicing=true] - Enable time-slicing
   */
  constructor(config = {}) {
    this.maxFrameTime = config.maxFrameTime || 16; // 60fps target
    this.batchSize = config.batchSize || 50;
    this.enableTimeSlicing = config.enableTimeSlicing !== false;
  }

  /**
   * Yield to main thread if needed to maintain frame rate
   * @param {number} startTime - Execution start time (performance.now())
   * @param {number} [maxTime] - Max execution time before yielding (uses maxFrameTime if not provided)
   * @returns {Promise<void>} Resolves when ready to continue
   */
  async yieldIfNeeded(startTime, maxTime) {
    if (!this.enableTimeSlicing) {
      return;
    }

    const elapsed = performance.now() - startTime;
    const threshold = maxTime !== undefined ? maxTime : this.maxFrameTime;

    if (elapsed >= threshold) {
      return this.yieldToMainThread();
    }
  }

  /**
   * Yield control to main thread
   * @returns {Promise<void>} Resolves on next idle callback or timeout
   */
  async yieldToMainThread() {
    return new Promise(resolve => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(resolve, { timeout: 100 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * Determine if elements should be processed in batches
   * @param {number} elementCount - Number of elements to process
   * @returns {boolean} True if batching is recommended
   */
  shouldBatch(elementCount) {
    return elementCount > this.batchSize;
  }

  /**
   * Get appropriate batch size for given element count
   * @param {number} totalElements - Total elements to process
   * @returns {number} Recommended batch size
   */
  getBatchSize(totalElements) {
    if (totalElements <= this.batchSize) {
      return totalElements;
    }

    // Adaptive batching: smaller batches for very large sets
    if (totalElements > 1000) {
      return Math.floor(this.batchSize / 2);
    }

    return this.batchSize;
  }

  /**
   * Execute processing function in batches with time-slicing
   * @param {Array} items - Items to process
   * @param {Function} processFn - Function to process each batch
   * @param {number} [batchSize] - Override default batch size
   * @returns {Promise<Array>} Results from all batches
   */
  async executeInBatches(items, processFn, batchSize) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const size = batchSize || this.getBatchSize(items.length);
    const results = [];
    const startTime = performance.now();

    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);

      try {
        const batchResults = await processFn(batch);
        if (batchResults !== undefined) {
          results.push(...(Array.isArray(batchResults) ? batchResults : [batchResults]));
        }
      } catch (error) {
        Logger.error(
          "RuleExecution:PerformanceCoordinator",
          "Batch processing error",
          error
        );
        // Continue with next batch instead of failing completely
      }

      // Yield after each batch
      await this.yieldIfNeeded(startTime, this.maxFrameTime);
    }

    return results;
  }

  /**
   * Get performance metrics
   * @returns {object} Current configuration and stats
   */
  getMetrics() {
    return {
      maxFrameTime: this.maxFrameTime,
      batchSize: this.batchSize,
      enableTimeSlicing: this.enableTimeSlicing,
      targetFPS: Math.floor(1000 / this.maxFrameTime)
    };
  }

  /**
   * Update configuration
   * @param {object} config - New configuration options
   */
  updateConfig(config) {
    if (config.maxFrameTime !== undefined) {
      this.maxFrameTime = config.maxFrameTime;
    }
    if (config.batchSize !== undefined) {
      this.batchSize = config.batchSize;
    }
    if (config.enableTimeSlicing !== undefined) {
      this.enableTimeSlicing = config.enableTimeSlicing;
    }
  }
}
