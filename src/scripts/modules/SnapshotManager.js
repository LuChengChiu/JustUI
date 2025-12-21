/**
 * Snapshot Manager Module
 * Handles batch geometry capture and validation to eliminate layout thrashing
 * Implements strict read-write separation pattern
 */

export class SnapshotManager {
  constructor(config = {}) {
    this.config = {
      maxSnapshotAge: config.maxSnapshotAge || 100, // ms
      geometryChangeThreshold: config.geometryChangeThreshold || 10, // px
      maxValidationRetries: config.maxValidationRetries || 2
    };
    
    this.stats = {
      snapshotsCreated: 0,
      validationAttempts: 0,
      validationSuccesses: 0,
      validationFailures: 0,
      staleSnapshots: 0,
      geometryChanges: 0
    };
    
    // WeakMap for automatic garbage collection
    this.snapshotCache = new WeakMap();
  }

  /**
   * Create snapshot for a single element
   * @param {HTMLElement} element - Element to snapshot
   * @returns {object} Snapshot object with geometry and style data
   */
  createSnapshot(element) {
    try {
      const timestamp = performance.now();
      
      // Capture geometry (forces layout calculation)
      const rect = element.getBoundingClientRect();
      
      // Capture computed style (forces style recalculation)
      const style = window.getComputedStyle(element);
      
      const snapshot = {
        element: element,
        timestamp: timestamp,
        
        // Geometry data
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        
        // Style data
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        zIndex: style.zIndex,
        transform: style.transform,
        
        // Element identification
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        
        // Validation helpers
        isConnected: element.isConnected,
        hasParent: !!element.parentElement
      };
      
      // Cache for potential reuse
      this.snapshotCache.set(element, snapshot);
      this.stats.snapshotsCreated++;
      
      return snapshot;
    } catch (error) {
      console.warn('JustUI: Error creating snapshot for element:', error);
      return this._createErrorSnapshot(element, error);
    }
  }

  /**
   * Create snapshots for multiple elements in tight loop (optimized for browser batching)
   * @param {HTMLElement[]|NodeList} elements - Elements to snapshot
   * @returns {object[]} Array of snapshot objects
   */
  createBulkSnapshots(elements) {
    const snapshots = [];
    const startTime = performance.now();
    
    console.log(`JustUI: Creating bulk snapshots for ${elements.length} elements`);
    
    try {
      // CRITICAL: Tight loop without DOM mutations allows browser to batch layout calculations
      for (const element of elements) {
        // Skip elements that are clearly invalid
        if (!element || !element.isConnected) {
          continue;
        }
        
        const snapshot = this.createSnapshot(element);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
      
      const duration = performance.now() - startTime;
      console.log(`JustUI: Created ${snapshots.length} snapshots in ${Math.round(duration)}ms`);
      
      return snapshots;
    } catch (error) {
      console.error('JustUI: Error in bulk snapshot creation:', error);
      return snapshots; // Return partial results
    }
  }

  /**
   * Validate snapshot against current element state
   * @param {object} snapshot - Snapshot to validate
   * @param {boolean} strictMode - Whether to use strict validation
   * @returns {object} Validation result
   */
  validateSnapshot(snapshot, strictMode = false) {
    this.stats.validationAttempts++;
    
    try {
      const element = snapshot.element;
      
      // 1. Basic connectivity check (cheap)
      if (!element || !element.isConnected) {
        this.stats.validationFailures++;
        return {
          valid: false,
          reason: 'element-disconnected',
          stale: true,
          recoverable: false
        };
      }
      
      // 2. Age check
      const age = performance.now() - snapshot.timestamp;
      if (age > this.config.maxSnapshotAge) {
        this.stats.staleSnapshots++;
        return {
          valid: false,
          reason: 'snapshot-stale',
          age: age,
          stale: true,
          recoverable: strictMode ? false : true
        };
      }
      
      // 3. Geometry validation (expensive - forces layout)
      if (strictMode) {
        const currentRect = element.getBoundingClientRect();
        const geometryChanged = (
          Math.abs(currentRect.width - snapshot.width) > this.config.geometryChangeThreshold ||
          Math.abs(currentRect.height - snapshot.height) > this.config.geometryChangeThreshold
        );
        
        if (geometryChanged) {
          this.stats.geometryChanges++;
          this.stats.validationFailures++;
          return {
            valid: false,
            reason: 'geometry-changed',
            oldDimensions: { width: snapshot.width, height: snapshot.height },
            newDimensions: { width: currentRect.width, height: currentRect.height },
            recoverable: false
          };
        }
      }
      
      // 4. Parent relationship check (cheap)
      if (snapshot.hasParent && !element.parentElement) {
        this.stats.validationFailures++;
        return {
          valid: false,
          reason: 'parent-removed',
          recoverable: false
        };
      }
      
      this.stats.validationSuccesses++;
      return {
        valid: true,
        age: age,
        reason: 'valid'
      };
      
    } catch (error) {
      this.stats.validationFailures++;
      return {
        valid: false,
        reason: 'validation-error',
        error: error.message,
        recoverable: false
      };
    }
  }

  /**
   * Check if snapshot is fresh enough for use
   * @param {object} snapshot - Snapshot to check
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {boolean} True if snapshot is fresh
   */
  isSnapshotFresh(snapshot, maxAge = this.config.maxSnapshotAge) {
    if (!snapshot || !snapshot.timestamp) return false;
    return (performance.now() - snapshot.timestamp) <= maxAge;
  }

  /**
   * Validate a batch of snapshots efficiently
   * @param {object[]} snapshots - Snapshots to validate
   * @param {boolean} strictMode - Whether to use strict validation
   * @returns {object} Batch validation results
   */
  validateBatch(snapshots, strictMode = false) {
    const validSnapshots = [];
    const invalidSnapshots = [];
    const validationResults = [];
    
    for (const snapshot of snapshots) {
      const result = this.validateSnapshot(snapshot, strictMode);
      validationResults.push(result);
      
      if (result.valid) {
        validSnapshots.push(snapshot);
      } else {
        invalidSnapshots.push({ snapshot, reason: result.reason });
      }
    }
    
    return {
      validSnapshots,
      invalidSnapshots,
      validationResults,
      validCount: validSnapshots.length,
      invalidCount: invalidSnapshots.length,
      successRate: snapshots.length > 0 
        ? (validSnapshots.length / snapshots.length * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Refresh stale snapshot by creating a new one
   * @param {object} oldSnapshot - Stale snapshot to refresh
   * @returns {object} New snapshot or null if element is invalid
   */
  refreshSnapshot(oldSnapshot) {
    if (!oldSnapshot || !oldSnapshot.element || !oldSnapshot.element.isConnected) {
      return null;
    }
    
    return this.createSnapshot(oldSnapshot.element);
  }

  /**
   * Get cached snapshot for element (if available and fresh)
   * @param {HTMLElement} element - Element to get snapshot for
   * @returns {object|null} Cached snapshot or null
   */
  getCachedSnapshot(element) {
    const cached = this.snapshotCache.get(element);
    if (cached && this.isSnapshotFresh(cached)) {
      return cached;
    }
    return null;
  }

  /**
   * Create error snapshot for elements that fail normal snapshotting
   * @param {HTMLElement} element - Element that failed
   * @param {Error} error - The error that occurred
   * @returns {object} Error snapshot
   * @private
   */
  _createErrorSnapshot(element, error) {
    return {
      element: element,
      timestamp: performance.now(),
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'unknown',
      visibility: 'unknown',
      opacity: '0',
      position: 'unknown',
      zIndex: 'unknown',
      transform: 'none',
      tagName: element ? element.tagName : 'UNKNOWN',
      id: element ? element.id : '',
      className: element ? element.className : '',
      isConnected: element ? element.isConnected : false,
      hasParent: element ? !!element.parentElement : false,
      error: true,
      errorMessage: error.message
    };
  }

  /**
   * Get snapshot statistics
   * @returns {object} Performance and accuracy stats
   */
  getStats() {
    return {
      ...this.stats,
      validationSuccessRate: this.stats.validationAttempts > 0
        ? (this.stats.validationSuccesses / this.stats.validationAttempts * 100).toFixed(1) + '%'
        : '0%',
      averageAge: this.config.maxSnapshotAge / 2, // Approximate average
      geometryChangeRate: this.stats.validationAttempts > 0
        ? (this.stats.geometryChanges / this.stats.validationAttempts * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      snapshotsCreated: 0,
      validationAttempts: 0,
      validationSuccesses: 0,
      validationFailures: 0,
      staleSnapshots: 0,
      geometryChanges: 0
    };
  }

  /**
   * Clear snapshot cache
   */
  clearCache() {
    this.snapshotCache = new WeakMap();
  }

  /**
   * Cleanup method implementation for ICleanable interface
   */
  cleanup() {
    this.clearCache();
    this.resetStats();
    this.config = null;
    
    console.log('JustUI: SnapshotManager cleaned up');
  }
}