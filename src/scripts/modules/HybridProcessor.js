/**
 * Hybrid Processor Module
 * Orchestrates dual processing strategies: bulk optimization for standard elements,
 * real-time processing for critical elements
 */

import { ElementRemover } from './ElementRemover.js';
import { PATTERN_DETECTION_CONFIG } from '../constants.js';

export class HybridProcessor {
  constructor(adDetectionEngine, config = {}) {
    this.adDetectionEngine = adDetectionEngine;
    this.config = {
      criticalElementTimeout: config.criticalElementTimeout || 30, // ms per critical element
      bulkValidationEnabled: config.bulkValidationEnabled !== false,
      fallbackToRealTime: config.fallbackToRealTime !== false,
      adaptiveDetectionEnabled: config.adaptiveDetectionEnabled !== false
    };
    
    this.stats = {
      bulkProcessed: 0,
      criticalProcessed: 0,
      bulkRemoved: 0,
      criticalRemoved: 0,
      fallbacksTriggered: 0,
      validationFailures: 0,
      processingErrors: 0
    };
    
    this.removedElementsSet = new WeakSet();
  }

  /**
   * Execute hybrid processing strategy
   * @param {HTMLElement[]|NodeList} allElements - All elements to process
   * @param {object} dependencies - Required dependencies (classifier, snapshots, tracker)
   * @returns {number} Total number of elements removed
   */
  async executeHybridStrategy(allElements, dependencies) {
    const { elementClassifier, snapshotManager, perfTracker } = dependencies;
    const startTime = performance.now();
    
    try {
      // 1. Classify elements
      const classificationStart = performance.now();
      const { criticalElements, bulkElements } = elementClassifier.classifyBatch(allElements);
      const classificationTime = performance.now() - classificationStart;
      
      console.log(`JustUI: Hybrid classification - ${criticalElements.length} critical, ${bulkElements.length} bulk elements (${Math.round(classificationTime)}ms)`);
      
      // 2. Execute both strategies in parallel
      const [bulkResults, criticalResults] = await Promise.all([
        this.executeBulkOptimization(bulkElements, { snapshotManager, perfTracker }),
        this.executeRealTimeDetection(criticalElements, { perfTracker })
      ]);
      
      const totalTime = performance.now() - startTime;
      const totalRemoved = bulkResults.removedCount + criticalResults.removedCount;
      
      // 3. Log comprehensive results
      this._logHybridResults({
        totalElements: allElements.length,
        criticalCount: criticalElements.length,
        bulkCount: bulkElements.length,
        totalRemoved: totalRemoved,
        bulkResults,
        criticalResults,
        totalTime,
        classificationTime
      });
      
      return totalRemoved;
      
    } catch (error) {
      console.error('JustUI: Error in hybrid strategy execution:', error);
      this.stats.processingErrors++;
      
      // Fallback to traditional processing if enabled
      if (this.config.fallbackToRealTime) {
        console.warn('JustUI: Falling back to real-time processing for all elements');
        return await this._executeFallbackProcessing(allElements);
      }
      
      return 0;
    }
  }

  /**
   * Execute bulk optimization for standard elements using snapshots
   * @param {HTMLElement[]} elements - Bulk elements to process
   * @param {object} dependencies - Required dependencies
   * @returns {object} Processing results
   */
  async executeBulkOptimization(elements, dependencies) {
    if (elements.length === 0) return { removedCount: 0, processedCount: 0, errors: [] };
    
    const { snapshotManager, perfTracker } = dependencies;
    const startTime = performance.now();
    
    try {
      // 1. Create bulk snapshots (single layout calculation)
      const snapshotStart = performance.now();
      const snapshots = snapshotManager.createBulkSnapshots(elements);
      const snapshotTime = performance.now() - snapshotStart;
      
      if (perfTracker) {
        perfTracker.recordFiltering(elements.length, snapshots.length, snapshotTime);
      }
      
      // 2. Filter snapshots using pure JS logic
      const validSnapshots = this._filterSnapshotsForAnalysis(snapshots);
      
      // 3. Concurrent analysis phase
      const analysisStart = performance.now();
      const analysisPromises = validSnapshots.map(snapshot => 
        this._analyzeElementFromSnapshot(snapshot)
      );
      
      const analysisResults = await Promise.all(analysisPromises);
      const analysisTime = performance.now() - analysisStart;
      
      if (perfTracker) {
        perfTracker.recordAnalysis(validSnapshots.length, analysisTime);
      }
      
      // 4. Batch removal phase (with validation if enabled)
      const removalStart = performance.now();
      const removalResults = await this._executeBatchRemoval(
        analysisResults, 
        snapshotManager,
        this.config.bulkValidationEnabled
      );
      const removalTime = performance.now() - removalStart;
      
      if (perfTracker) {
        perfTracker.recordRemoval(removalResults.removedCount, removalTime);
      }
      
      this.stats.bulkProcessed += validSnapshots.length;
      this.stats.bulkRemoved += removalResults.removedCount;
      
      return {
        removedCount: removalResults.removedCount,
        processedCount: validSnapshots.length,
        validationFailures: removalResults.validationFailures,
        totalTime: performance.now() - startTime,
        errors: removalResults.errors || []
      };
      
    } catch (error) {
      console.error('JustUI: Error in bulk optimization:', error);
      return { removedCount: 0, processedCount: 0, errors: [error.message] };
    }
  }

  /**
   * Execute real-time detection for critical elements
   * @param {HTMLElement[]} elements - Critical elements to process
   * @param {object} dependencies - Required dependencies
   * @returns {object} Processing results
   */
  async executeRealTimeDetection(elements, dependencies) {
    if (elements.length === 0) return { removedCount: 0, processedCount: 0, errors: [] };
    
    const { perfTracker } = dependencies;
    const startTime = performance.now();
    let removedCount = 0;
    let processedCount = 0;
    let totalAnalysisTime = 0;
    const errors = [];
    
    try {
      console.log(`JustUI: Real-time processing ${elements.length} critical elements`);
      
      for (const element of elements) {
        try {
          // Skip if element was already processed or removed
          if (!element.isConnected || ElementRemover.isProcessed(element)) {
            continue;
          }
          
          // Skip if element is child of already removed element
          if (this._isDescendantOfRemoved(element)) {
            continue;
          }
          
          const elementStart = performance.now();
          
          // Real-time analysis with timeout
          const analysis = await Promise.race([
            this.adDetectionEngine.analyze(element),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Critical element timeout')), 
                this.config.criticalElementTimeout)
            )
          ]);
          
          const elementTime = performance.now() - elementStart;
          totalAnalysisTime += elementTime;
          
          // Process analysis result
          if (analysis.isAd && analysis.confidence > 0.7) {
            element.setAttribute('data-justui-confidence', Math.round(analysis.confidence * 100));
            element.setAttribute('data-justui-rules', analysis.matchedRules.map(r => r.rule).join(','));
            
            if (ElementRemover.removeElement(element, `critical-${analysis.totalScore}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
              removedCount++;
              this.removedElementsSet.add(element);
              
              console.log(`JustUI: Critical element removed (score: ${analysis.totalScore}, confidence: ${Math.round(analysis.confidence * 100)}%, time: ${Math.round(elementTime)}ms)`, {
                rules: analysis.matchedRules,
                element: element.tagName + (element.className ? `.${element.className.split(' ')[0]}` : '')
              });
            }
          }
          
          processedCount++;
          
          // Log slow critical elements
          if (elementTime > this.config.criticalElementTimeout * 0.8) {
            console.warn(`JustUI: Slow critical element (${Math.round(elementTime)}ms):`, element.tagName);
          }
          
        } catch (error) {
          if (error.message.includes('timeout')) {
            console.warn('JustUI: Critical element analysis timeout, neutralizing element');
            ElementRemover.removeElement(element, 'critical-timeout', ElementRemover.REMOVAL_STRATEGIES.NEUTRALIZE);
          } else {
            console.error('JustUI: Error analyzing critical element:', error);
            errors.push(error.message);
          }
        }
      }
      
      this.stats.criticalProcessed += processedCount;
      this.stats.criticalRemoved += removedCount;
      
      // Record performance metrics
      if (perfTracker) {
        const totalTime = performance.now() - startTime;
        perfTracker.recordFiltering(elements.length, processedCount, totalTime - totalAnalysisTime);
        perfTracker.recordAnalysis(processedCount, totalAnalysisTime);
        perfTracker.recordRemoval(removedCount, totalTime - totalAnalysisTime);
      }
      
      return {
        removedCount,
        processedCount,
        totalTime: performance.now() - startTime,
        errors
      };
      
    } catch (error) {
      console.error('JustUI: Error in real-time detection:', error);
      return { removedCount: 0, processedCount: 0, errors: [error.message] };
    }
  }

  /**
   * Filter snapshots for analysis using pure JS logic (no DOM access)
   * @param {object[]} snapshots - Snapshots to filter
   * @returns {object[]} Filtered snapshots ready for analysis
   * @private
   */
  _filterSnapshotsForAnalysis(snapshots) {
    return snapshots.filter(snapshot => {
      // Skip error snapshots
      if (snapshot.error) return false;
      
      // Skip tiny elements
      if (snapshot.width < 10 || snapshot.height < 10) return false;
      
      // Skip invisible elements
      if (snapshot.display === 'none' || 
          snapshot.visibility === 'hidden' || 
          snapshot.opacity === '0') return false;
      
      // Skip disconnected elements
      if (!snapshot.isConnected) return false;
      
      return true;
    });
  }

  /**
   * Analyze element from snapshot data
   * @param {object} snapshot - Element snapshot
   * @returns {Promise<object>} Analysis result
   * @private
   */
  async _analyzeElementFromSnapshot(snapshot) {
    try {
      // Use timeout protection for analysis
      const analysis = await Promise.race([
        this.adDetectionEngine.analyze(snapshot.element),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), PATTERN_DETECTION_CONFIG.MAX_ELEMENT_TIME)
        )
      ]);
      
      return {
        element: snapshot.element,
        snapshot: snapshot,
        analysis: analysis,
        success: true
      };
    } catch (error) {
      return {
        element: snapshot.element,
        snapshot: snapshot,
        analysis: { isAd: false, confidence: 0, totalScore: 0, matchedRules: [] },
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Execute batch removal with optional validation
   * @param {object[]} analysisResults - Results from analysis phase
   * @param {object} snapshotManager - Snapshot manager for validation
   * @param {boolean} validateSnapshots - Whether to validate before removal
   * @returns {object} Removal results
   * @private
   */
  async _executeBatchRemoval(analysisResults, snapshotManager, validateSnapshots) {
    let removedCount = 0;
    let validationFailures = 0;
    const errors = [];
    
    const elementsToRemove = analysisResults.filter(result => 
      result.success && result.analysis.isAd && result.analysis.confidence > 0.7
    );
    
    for (const result of elementsToRemove) {
      try {
        const { element, analysis, snapshot } = result;
        
        // Optional snapshot validation before removal
        if (validateSnapshots) {
          const validation = snapshotManager.validateSnapshot(snapshot, false);
          if (!validation.valid) {
            validationFailures++;
            this.stats.validationFailures++;
            console.debug(`JustUI: Skipping removal due to ${validation.reason}:`, element.tagName);
            continue;
          }
        }
        
        // Prepare element for removal
        element.setAttribute('data-justui-confidence', Math.round(analysis.confidence * 100));
        element.setAttribute('data-justui-rules', analysis.matchedRules.map(r => r.rule).join(','));
        
        // Execute removal
        if (ElementRemover.removeElement(element, `bulk-${analysis.totalScore}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
          removedCount++;
          this.removedElementsSet.add(element);
        }
        
      } catch (error) {
        errors.push(error.message);
        console.error('JustUI: Error during batch removal:', error);
      }
    }
    
    return { removedCount, validationFailures, errors };
  }

  /**
   * Check if element is descendant of removed element
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if descendant of removed element
   * @private
   */
  _isDescendantOfRemoved(element) {
    try {
      let parent = element.parentElement;
      let depth = 0;
      while (parent && depth < 10) {
        if (this.removedElementsSet.has(parent)) {
          return true;
        }
        parent = parent.parentElement;
        depth++;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Fallback processing for when hybrid strategy fails
   * @param {HTMLElement[]} allElements - All elements to process
   * @returns {number} Number of elements removed
   * @private
   */
  async _executeFallbackProcessing(allElements) {
    this.stats.fallbacksTriggered++;
    console.warn('JustUI: Executing fallback processing');
    
    // Simple sequential processing as fallback
    let removedCount = 0;
    for (const element of allElements) {
      try {
        if (!element.isConnected || ElementRemover.isProcessed(element)) continue;
        
        const analysis = await this.adDetectionEngine.analyze(element);
        if (analysis.isAd && analysis.confidence > 0.7) {
          if (ElementRemover.removeElement(element, `fallback-${analysis.totalScore}`, ElementRemover.REMOVAL_STRATEGIES.REMOVE)) {
            removedCount++;
          }
        }
      } catch (error) {
        // Continue processing other elements
      }
    }
    
    return removedCount;
  }

  /**
   * Log comprehensive hybrid processing results
   * @param {object} results - Processing results
   * @private
   */
  _logHybridResults(results) {
    const {
      totalElements, criticalCount, bulkCount, totalRemoved,
      bulkResults, criticalResults, totalTime, classificationTime
    } = results;
    
    console.log(`JustUI: Hybrid processing completed - ${totalRemoved} elements removed in ${Math.round(totalTime)}ms`);
    
    console.log('JustUI: Hybrid Performance Summary:', {
      classification: {
        totalElements,
        criticalElements: criticalCount,
        bulkElements: bulkCount,
        criticalRatio: `${(criticalCount / totalElements * 100).toFixed(1)}%`,
        classificationTime: `${Math.round(classificationTime)}ms`
      },
      processing: {
        bulkTime: `${Math.round(bulkResults.totalTime)}ms`,
        criticalTime: `${Math.round(criticalResults.totalTime)}ms`,
        bulkRemoved: bulkResults.removedCount,
        criticalRemoved: criticalResults.removedCount,
        totalTime: `${Math.round(totalTime)}ms`
      },
      efficiency: {
        elementsPerMs: (totalElements / totalTime).toFixed(2),
        removalRate: `${(totalRemoved / totalElements * 100).toFixed(1)}%`,
        bulkValidationFailures: bulkResults.validationFailures || 0
      }
    });
  }

  /**
   * Get hybrid processing statistics
   * @returns {object} Comprehensive statistics
   */
  getStats() {
    const totalProcessed = this.stats.bulkProcessed + this.stats.criticalProcessed;
    const totalRemoved = this.stats.bulkRemoved + this.stats.criticalRemoved;
    
    return {
      ...this.stats,
      totalProcessed,
      totalRemoved,
      processingRatio: totalProcessed > 0 
        ? `${(this.stats.criticalProcessed / totalProcessed * 100).toFixed(1)}% critical`
        : '0% critical',
      removalEfficiency: totalProcessed > 0
        ? `${(totalRemoved / totalProcessed * 100).toFixed(1)}% removed`
        : '0% removed',
      errorRate: totalProcessed > 0
        ? `${(this.stats.processingErrors / totalProcessed * 100).toFixed(2)}% errors`
        : '0% errors'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      bulkProcessed: 0,
      criticalProcessed: 0,
      bulkRemoved: 0,
      criticalRemoved: 0,
      fallbacksTriggered: 0,
      validationFailures: 0,
      processingErrors: 0
    };
  }

  /**
   * Clear removed elements set
   */
  clearRemovedElements() {
    this.removedElementsSet = new WeakSet();
  }

  /**
   * Cleanup method implementation for ICleanable interface
   */
  cleanup() {
    this.clearRemovedElements();
    this.resetStats();
    this.adDetectionEngine = null;
    this.config = null;
    
    console.log('JustUI: HybridProcessor cleaned up');
  }
}