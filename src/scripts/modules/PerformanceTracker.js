/**
 * Performance Tracker Module - Adaptive batch sizing for pattern detection
 * Follows Single Responsibility Principle
 * Tracks execution time per element and calculates optimal batch sizes
 */

import { PATTERN_DETECTION_CONFIG } from '../constants.js';

export class PerformanceTracker {
  constructor(windowSize = PATTERN_DETECTION_CONFIG.PERF_WINDOW_SIZE) {
    this.windowSize = windowSize;
    this.measurements = [];
    this.avgTimePerElement = null;
  }

  /**
   * Record batch execution performance
   * @param {number} elementsProcessed - Number of elements processed in batch
   * @param {number} timeElapsed - Time taken for batch in milliseconds
   */
  recordBatch(elementsProcessed, timeElapsed) {
    if (elementsProcessed === 0) return;

    const timePerElement = timeElapsed / elementsProcessed;
    this.measurements.push(timePerElement);

    // Keep only last N measurements
    if (this.measurements.length > this.windowSize) {
      this.measurements.shift();
    }

    // Calculate moving average
    this.avgTimePerElement = this.measurements.reduce((a, b) => a + b) / this.measurements.length;
  }

  /**
   * Calculate next batch size based on target frame budget
   * @param {number} targetFrameBudget - Target frame time in milliseconds
   * @returns {number} - Recommended batch size
   */
  calculateNextBatchSize(targetFrameBudget) {
    if (!this.avgTimePerElement || this.avgTimePerElement === 0) {
      return PATTERN_DETECTION_CONFIG.INITIAL_BATCH_SIZE;
    }

    const estimatedSize = Math.floor(targetFrameBudget / this.avgTimePerElement);
    return Math.max(
      PATTERN_DETECTION_CONFIG.MIN_BATCH_SIZE, 
      Math.min(PATTERN_DETECTION_CONFIG.MAX_BATCH_SIZE, estimatedSize)
    );
  }

  /**
   * Reset performance measurements
   */
  reset() {
    this.measurements = [];
    this.avgTimePerElement = null;
  }

  /**
   * Get current performance statistics
   * @returns {object} - Performance stats
   */
  getStats() {
    return {
      avgTimePerElement: this.avgTimePerElement,
      measurementCount: this.measurements.length,
      isReady: this.avgTimePerElement !== null
    };
  }
}