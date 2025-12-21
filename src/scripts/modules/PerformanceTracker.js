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
    
    // Enhanced metrics for optimization tracking
    this.optimizationMetrics = {
      totalElementsQueried: 0,
      totalElementsFiltered: 0,
      totalElementsAnalyzed: 0,
      totalElementsRemoved: 0,
      filteringSavedTime: 0,
      concurrencyTime: 0,
      layoutTime: 0
    };
    
    // Hybrid-specific metrics
    this.hybridMetrics = {
      elementsClassified: 0,
      criticalElements: 0,
      bulkElements: 0,
      classificationTime: 0,
      snapshotsCreated: 0,
      snapshotCreationTime: 0,
      snapshotValidations: 0,
      validationSuccesses: 0,
      validationFailures: 0,
      bulkProcessingTime: 0,
      criticalProcessingTime: 0,
      hybridTotalTime: 0,
      fallbacksTriggered: 0
    };
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
   * Record filtering optimization metrics
   * @param {number} queriedCount - Total elements queried
   * @param {number} filteredCount - Elements that passed filtering
   * @param {number} filterTime - Time spent filtering in ms
   */
  recordFiltering(queriedCount, filteredCount, filterTime) {
    this.optimizationMetrics.totalElementsQueried += queriedCount;
    this.optimizationMetrics.totalElementsFiltered += filteredCount;
    this.optimizationMetrics.filteringSavedTime += filterTime;
  }

  /**
   * Record analysis phase metrics
   * @param {number} analyzedCount - Elements actually analyzed
   * @param {number} analysisTime - Time spent in analysis phase
   */
  recordAnalysis(analyzedCount, analysisTime) {
    this.optimizationMetrics.totalElementsAnalyzed += analyzedCount;
    this.optimizationMetrics.concurrencyTime += analysisTime;
  }

  /**
   * Record removal phase metrics
   * @param {number} removedCount - Elements removed
   * @param {number} removalTime - Time spent in removal phase
   */
  recordRemoval(removedCount, removalTime) {
    this.optimizationMetrics.totalElementsRemoved += removedCount;
    this.optimizationMetrics.layoutTime += removalTime;
  }

  /**
   * Get optimization summary statistics
   * @returns {object} - Optimization performance summary
   */
  getOptimizationSummary() {
    const metrics = this.optimizationMetrics;
    const filteredPercentage = metrics.totalElementsQueried > 0 
      ? ((metrics.totalElementsFiltered / metrics.totalElementsQueried) * 100).toFixed(1)
      : 0;
    
    const analysisEfficiency = metrics.totalElementsFiltered > 0
      ? ((metrics.totalElementsAnalyzed / metrics.totalElementsFiltered) * 100).toFixed(1) 
      : 0;

    return {
      ...metrics,
      filteredPercentage: `${filteredPercentage}%`,
      analysisEfficiency: `${analysisEfficiency}%`,
      averageAnalysisTime: metrics.totalElementsAnalyzed > 0 
        ? (metrics.concurrencyTime / metrics.totalElementsAnalyzed).toFixed(2)
        : 0,
      averageRemovalTime: metrics.totalElementsRemoved > 0
        ? (metrics.layoutTime / metrics.totalElementsRemoved).toFixed(2)
        : 0
    };
  }

  /**
   * Record hybrid classification metrics
   * @param {number} totalElements - Total elements classified
   * @param {number} criticalCount - Number of critical elements
   * @param {number} bulkCount - Number of bulk elements
   * @param {number} classificationTime - Time spent on classification
   */
  recordHybridClassification(totalElements, criticalCount, bulkCount, classificationTime) {
    this.hybridMetrics.elementsClassified += totalElements;
    this.hybridMetrics.criticalElements += criticalCount;
    this.hybridMetrics.bulkElements += bulkCount;
    this.hybridMetrics.classificationTime += classificationTime;
  }

  /**
   * Record snapshot creation metrics
   * @param {number} snapshotCount - Number of snapshots created
   * @param {number} creationTime - Time spent creating snapshots
   */
  recordSnapshotCreation(snapshotCount, creationTime) {
    this.hybridMetrics.snapshotsCreated += snapshotCount;
    this.hybridMetrics.snapshotCreationTime += creationTime;
  }

  /**
   * Record snapshot validation metrics
   * @param {number} validationCount - Number of validations performed
   * @param {number} successCount - Number of successful validations
   * @param {number} failureCount - Number of failed validations
   */
  recordSnapshotValidation(validationCount, successCount, failureCount) {
    this.hybridMetrics.snapshotValidations += validationCount;
    this.hybridMetrics.validationSuccesses += successCount;
    this.hybridMetrics.validationFailures += failureCount;
  }

  /**
   * Record hybrid processing phase times
   * @param {number} bulkTime - Time spent on bulk processing
   * @param {number} criticalTime - Time spent on critical processing
   * @param {number} totalTime - Total hybrid processing time
   */
  recordHybridProcessingTime(bulkTime, criticalTime, totalTime) {
    this.hybridMetrics.bulkProcessingTime += bulkTime;
    this.hybridMetrics.criticalProcessingTime += criticalTime;
    this.hybridMetrics.hybridTotalTime += totalTime;
  }

  /**
   * Record fallback event
   */
  recordFallback() {
    this.hybridMetrics.fallbacksTriggered++;
  }

  /**
   * Get hybrid performance summary
   * @returns {object} - Comprehensive hybrid metrics
   */
  getHybridSummary() {
    const h = this.hybridMetrics;
    
    return {
      classification: {
        totalElements: h.elementsClassified,
        criticalElements: h.criticalElements,
        bulkElements: h.bulkElements,
        criticalRatio: h.elementsClassified > 0 
          ? `${(h.criticalElements / h.elementsClassified * 100).toFixed(1)}%`
          : '0%',
        avgClassificationTime: h.elementsClassified > 0
          ? (h.classificationTime / h.elementsClassified).toFixed(2) + 'ms'
          : '0ms'
      },
      
      snapshots: {
        created: h.snapshotsCreated,
        avgCreationTime: h.snapshotsCreated > 0
          ? (h.snapshotCreationTime / h.snapshotsCreated).toFixed(2) + 'ms'
          : '0ms',
        validations: h.snapshotValidations,
        validationSuccessRate: h.snapshotValidations > 0
          ? `${(h.validationSuccesses / h.snapshotValidations * 100).toFixed(1)}%`
          : '0%'
      },
      
      processing: {
        bulkProcessingTime: h.bulkProcessingTime.toFixed(2) + 'ms',
        criticalProcessingTime: h.criticalProcessingTime.toFixed(2) + 'ms',
        totalHybridTime: h.hybridTotalTime.toFixed(2) + 'ms',
        timeDistribution: h.hybridTotalTime > 0 ? {
          bulk: `${(h.bulkProcessingTime / h.hybridTotalTime * 100).toFixed(1)}%`,
          critical: `${(h.criticalProcessingTime / h.hybridTotalTime * 100).toFixed(1)}%`
        } : { bulk: '0%', critical: '0%' }
      },
      
      efficiency: {
        elementsPerMs: h.hybridTotalTime > 0
          ? (h.elementsClassified / h.hybridTotalTime).toFixed(2)
          : '0',
        snapshotsPerMs: h.snapshotCreationTime > 0
          ? (h.snapshotsCreated / h.snapshotCreationTime).toFixed(2)
          : '0',
        validationFailureRate: h.snapshotValidations > 0
          ? `${(h.validationFailures / h.snapshotValidations * 100).toFixed(2)}%`
          : '0%',
        fallbackRate: h.elementsClassified > 0
          ? `${(h.fallbacksTriggered / h.elementsClassified * 100).toFixed(2)}%`
          : '0%'
      }
    };
  }

  /**
   * Reset hybrid metrics
   */
  resetHybridMetrics() {
    this.hybridMetrics = {
      elementsClassified: 0,
      criticalElements: 0,
      bulkElements: 0,
      classificationTime: 0,
      snapshotsCreated: 0,
      snapshotCreationTime: 0,
      snapshotValidations: 0,
      validationSuccesses: 0,
      validationFailures: 0,
      bulkProcessingTime: 0,
      criticalProcessingTime: 0,
      hybridTotalTime: 0,
      fallbacksTriggered: 0
    };
  }

  /**
   * Get current performance statistics
   * @returns {object} - Performance stats
   */
  getStats() {
    return {
      avgTimePerElement: this.avgTimePerElement,
      measurementCount: this.measurements.length,
      isReady: this.avgTimePerElement !== null,
      optimizations: this.getOptimizationSummary(),
      hybrid: this.getHybridSummary()
    };
  }

  /**
   * Cleanup method implementation for ICleanable interface
   * Clears all performance tracking data and metrics
   */
  cleanup() {
    // Reset all measurements and averages
    this.measurements = [];
    this.avgTimePerElement = null;
    
    // Clear optimization metrics
    this.optimizationMetrics = {
      totalElementsQueried: 0,
      totalElementsFiltered: 0,
      totalElementsAnalyzed: 0,
      totalElementsRemoved: 0,
      filteringSavedTime: 0,
      concurrencyTime: 0,
      layoutTime: 0
    };
    
    // Clear hybrid metrics
    this.resetHybridMetrics();
    
    console.log('JustUI: PerformanceTracker cleaned up');
  }
}