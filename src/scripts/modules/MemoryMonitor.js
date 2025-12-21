/**
 * Memory Monitor Module
 * Tracks memory usage, detects leaks, and provides cleanup verification
 * Implements comprehensive monitoring for the hybrid memory management system
 */

export class MemoryMonitor {
  constructor(options = {}) {
    this.options = {
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      memoryThreshold: options.memoryThreshold || 50 * 1024 * 1024, // 50MB
      gcAfterCleanup: options.gcAfterCleanup !== false,
      enablePerformanceMarking: options.enablePerformanceMarking !== false,
      maxHistoryEntries: options.maxHistoryEntries || 100
    };

    this.monitoringActive = false;
    this.monitoringTimer = null;
    this.memoryHistory = [];
    this.leakDetectionThreshold = 3; // Number of consecutive increases before leak warning
    this.performanceMarks = new Map();
    
    this.moduleReferences = new WeakMap(); // Track module memory usage
    this.cleanupResults = [];
    
    console.log('JustUI: MemoryMonitor initialized');
  }

  /**
   * Start memory monitoring
   * @param {Object} controller - Reference to JustUIController for monitoring
   */
  startMonitoring(controller) {
    if (this.monitoringActive) return;
    
    this.controller = controller;
    this.monitoringActive = true;
    
    // Initial memory snapshot
    this.takeMemorySnapshot('initial');
    
    this.monitoringTimer = setInterval(() => {
      this.performMemoryCheck();
    }, this.options.monitoringInterval);
    
    console.log(`JustUI: Memory monitoring started (interval: ${this.options.monitoringInterval}ms)`);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (!this.monitoringActive) return;
    
    this.monitoringActive = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    // Final memory snapshot
    this.takeMemorySnapshot('final');
    
    console.log('JustUI: Memory monitoring stopped');
  }

  /**
   * Perform comprehensive memory check
   */
  performMemoryCheck() {
    if (!this.monitoringActive) return;
    
    const snapshot = this.takeMemorySnapshot('periodic');
    
    // Check for memory growth patterns
    this.detectMemoryLeaks(snapshot);
    
    // Check cleanup registry health
    this.verifyCleanupRegistryHealth();
    
    // Check module-specific memory usage
    this.checkModuleMemoryUsage();
    
    // Enforce history limits
    this.enforceHistoryLimits();
  }

  /**
   * Take a memory snapshot
   * @param {string} type - Type of snapshot ('initial', 'periodic', 'cleanup', 'final')
   * @returns {Object} Memory snapshot data
   */
  takeMemorySnapshot(type = 'periodic') {
    const now = Date.now();
    let memoryInfo = {};
    
    // Use performance.memory if available (Chrome)
    if (performance.memory) {
      memoryInfo = {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    
    const snapshot = {
      timestamp: now,
      type,
      memory: memoryInfo,
      domNodes: document.querySelectorAll('*').length,
      eventListeners: this.estimateEventListeners(),
      moduleStats: this.getModuleMemoryStats()
    };
    
    this.memoryHistory.push(snapshot);
    
    if (this.options.enablePerformanceMarking) {
      performance.mark(`justui-memory-${type}-${now}`);
    }
    
    return snapshot;
  }

  /**
   * Detect potential memory leaks based on growth patterns
   * @param {Object} currentSnapshot - Current memory snapshot
   */
  detectMemoryLeaks(currentSnapshot) {
    if (this.memoryHistory.length < this.leakDetectionThreshold + 1) return;
    
    const recentSnapshots = this.memoryHistory.slice(-this.leakDetectionThreshold);
    
    // Check for consistent memory growth
    let consistentGrowth = true;
    let totalGrowth = 0;
    
    for (let i = 1; i < recentSnapshots.length; i++) {
      const prev = recentSnapshots[i - 1];
      const curr = recentSnapshots[i];
      
      if (curr.memory.usedJSHeapSize && prev.memory.usedJSHeapSize) {
        const growth = curr.memory.usedJSHeapSize - prev.memory.usedJSHeapSize;
        
        if (growth <= 0) {
          consistentGrowth = false;
          break;
        }
        
        totalGrowth += growth;
      }
    }
    
    if (consistentGrowth && totalGrowth > this.options.memoryThreshold * 0.1) {
      console.warn('JustUI: Potential memory leak detected', {
        totalGrowth: `${(totalGrowth / 1024 / 1024).toFixed(2)}MB`,
        snapshots: this.leakDetectionThreshold,
        averageGrowth: `${(totalGrowth / this.leakDetectionThreshold / 1024 / 1024).toFixed(2)}MB`
      });
      
      this.suggestCleanupActions();
    }
  }

  /**
   * Verify cleanup registry health
   */
  verifyCleanupRegistryHealth() {
    if (!this.controller?.cleanupRegistry) return;
    
    const registryStats = this.controller.cleanupRegistry.getMemoryStats();
    
    // Check for expired compartments
    const expiredCompartments = Object.entries(registryStats.compartments)
      .filter(([name, stats]) => stats.isExpired);
    
    if (expiredCompartments.length > 0) {
      console.log(`JustUI: Found ${expiredCompartments.length} expired compartments, suggesting cleanup`);
      
      // Trigger automatic cleanup of expired compartments
      expiredCompartments.forEach(([name]) => {
        this.controller.cleanupRegistry.cleanupCompartment(name);
      });
    }
    
    // Check for oversized compartments
    const oversizedCompartments = Object.entries(registryStats.compartments)
      .filter(([name, stats]) => stats.moduleCount > 50);
    
    if (oversizedCompartments.length > 0) {
      console.warn('JustUI: Found oversized compartments', oversizedCompartments.map(([name, stats]) => ({
        name,
        moduleCount: stats.moduleCount
      })));
    }
  }

  /**
   * Check module-specific memory usage
   */
  checkModuleMemoryUsage() {
    if (!this.controller) return;
    
    const moduleChecks = [
      {
        name: 'ElementRemover',
        check: () => this.controller.constructor.getStats?.() || {}
      },
      {
        name: 'ElementClassifier', 
        check: () => this.controller.elementClassifier?.getStats?.() || {}
      },
      {
        name: 'PerformanceTracker',
        check: () => this.controller.performanceTracker?.getHybridSummary?.() || {}
      }
    ];
    
    moduleChecks.forEach(({ name, check }) => {
      try {
        const stats = check();
        if (stats.cacheEfficiency) {
          console.log(`JustUI: ${name} cache efficiency: ${stats.cacheEfficiency}`);
        }
      } catch (error) {
        console.warn(`JustUI: Error checking ${name} stats:`, error);
      }
    });
  }

  /**
   * Estimate number of event listeners (rough approximation)
   * @returns {number} Estimated event listener count
   */
  estimateEventListeners() {
    // This is a rough approximation since there's no direct way to count all listeners
    const elementsWithEvents = document.querySelectorAll('[onclick], [onload], [onerror]').length;
    const scriptTags = document.querySelectorAll('script').length;
    return elementsWithEvents + (scriptTags * 2); // Rough estimate
  }

  /**
   * Get module memory statistics
   * @returns {Object} Module memory stats
   */
  getModuleMemoryStats() {
    if (!this.controller?.cleanupRegistry) return {};
    
    return {
      totalModules: this.controller.cleanupRegistry.getModuleCount(),
      moduleNames: this.controller.cleanupRegistry.getModuleNames(),
      registryStats: this.controller.cleanupRegistry.getMemoryStats()
    };
  }

  /**
   * Suggest cleanup actions based on memory analysis
   */
  suggestCleanupActions() {
    const suggestions = [];
    
    const lastSnapshot = this.memoryHistory[this.memoryHistory.length - 1];
    
    if (lastSnapshot.domNodes > 10000) {
      suggestions.push('High DOM node count detected - consider aggressive element removal');
    }
    
    if (lastSnapshot.memory.usedJSHeapSize > this.options.memoryThreshold) {
      suggestions.push('Memory usage above threshold - trigger cleanup');
    }
    
    if (suggestions.length > 0) {
      console.log('JustUI: Memory optimization suggestions:', suggestions);
      
      // Trigger automatic cleanup if available
      if (this.controller?.cleanupRegistry) {
        console.log('JustUI: Triggering automatic memory cleanup');
        this.controller.cleanupRegistry.performPeriodicCleanup();
      }
    }
  }

  /**
   * Verify cleanup effectiveness
   * @param {Object} beforeSnapshot - Snapshot before cleanup
   * @param {Object} afterSnapshot - Snapshot after cleanup  
   * @returns {Object} Cleanup verification results
   */
  verifyCleanupEffectiveness(beforeSnapshot, afterSnapshot) {
    const results = {
      success: false,
      memoryReduced: 0,
      percentageReduced: 0,
      domNodesReduced: 0,
      issues: []
    };
    
    if (beforeSnapshot.memory.usedJSHeapSize && afterSnapshot.memory.usedJSHeapSize) {
      const memoryDiff = beforeSnapshot.memory.usedJSHeapSize - afterSnapshot.memory.usedJSHeapSize;
      results.memoryReduced = memoryDiff;
      results.percentageReduced = (memoryDiff / beforeSnapshot.memory.usedJSHeapSize) * 100;
      results.success = memoryDiff > 0;
    }
    
    results.domNodesReduced = beforeSnapshot.domNodes - afterSnapshot.domNodes;
    
    if (results.memoryReduced < 0) {
      results.issues.push('Memory usage increased after cleanup');
    }
    
    if (results.percentageReduced < 5) {
      results.issues.push('Cleanup had minimal memory impact');
    }
    
    console.log('JustUI: Cleanup verification results:', {
      memoryReduced: `${(results.memoryReduced / 1024 / 1024).toFixed(2)}MB`,
      percentageReduced: `${results.percentageReduced.toFixed(1)}%`,
      domNodesReduced: results.domNodesReduced,
      success: results.success
    });
    
    this.cleanupResults.push({
      timestamp: Date.now(),
      ...results
    });
    
    return results;
  }

  /**
   * Force garbage collection if possible
   */
  forceGarbageCollection() {
    if (window.gc && typeof window.gc === 'function') {
      console.log('JustUI: Forcing garbage collection');
      window.gc();
    } else if (this.options.gcAfterCleanup) {
      // Indirect GC trigger by creating and releasing memory pressure
      console.log('JustUI: Triggering indirect garbage collection');
      const temp = new Array(100000).fill(0).map((_, i) => ({ id: i }));
      temp.length = 0;
    }
  }

  /**
   * Enforce memory history limits
   */
  enforceHistoryLimits() {
    if (this.memoryHistory.length > this.options.maxHistoryEntries) {
      const excess = this.memoryHistory.length - this.options.maxHistoryEntries;
      this.memoryHistory.splice(0, excess);
    }
    
    // Limit cleanup results history
    if (this.cleanupResults.length > 50) {
      this.cleanupResults.splice(0, this.cleanupResults.length - 50);
    }
  }

  /**
   * Get comprehensive memory report
   * @returns {Object} Complete memory usage report
   */
  getMemoryReport() {
    const latest = this.memoryHistory[this.memoryHistory.length - 1];
    const initial = this.memoryHistory[0];
    
    return {
      current: latest,
      initial: initial,
      history: this.memoryHistory.slice(-10), // Last 10 snapshots
      cleanupHistory: this.cleanupResults.slice(-5), // Last 5 cleanup results
      leakDetection: {
        threshold: this.leakDetectionThreshold,
        memoryThreshold: this.options.memoryThreshold
      },
      recommendations: this.getMemoryRecommendations()
    };
  }

  /**
   * Get memory optimization recommendations
   * @returns {string[]} Array of recommendations
   */
  getMemoryRecommendations() {
    const recommendations = [];
    
    if (this.memoryHistory.length < 3) {
      recommendations.push('Insufficient monitoring data - continue monitoring');
      return recommendations;
    }
    
    const latest = this.memoryHistory[this.memoryHistory.length - 1];
    const initial = this.memoryHistory[0];
    
    if (latest.memory.usedJSHeapSize > initial.memory.usedJSHeapSize * 1.5) {
      recommendations.push('Memory usage has increased significantly - consider cleanup');
    }
    
    if (latest.domNodes > initial.domNodes * 2) {
      recommendations.push('DOM node count has doubled - aggressive element removal recommended');
    }
    
    const avgCleanupSuccess = this.cleanupResults.length > 0 
      ? this.cleanupResults.reduce((sum, r) => sum + (r.success ? 1 : 0), 0) / this.cleanupResults.length 
      : 1;
      
    if (avgCleanupSuccess < 0.7) {
      recommendations.push('Cleanup effectiveness is low - review cleanup strategies');
    }
    
    return recommendations;
  }

  /**
   * Cleanup method for memory monitor itself
   */
  cleanup() {
    this.stopMonitoring();
    
    // Clear all stored data
    this.memoryHistory = [];
    this.cleanupResults = [];
    this.moduleReferences = new WeakMap();
    this.performanceMarks.clear();
    
    console.log('JustUI: MemoryMonitor cleaned up');
  }
}