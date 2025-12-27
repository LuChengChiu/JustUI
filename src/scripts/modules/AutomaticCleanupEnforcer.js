/**
 * Automatic Cleanup Enforcement System
 * Monitors modules for potential memory leaks and enforces cleanup policies
 * @fileoverview Provides automatic cleanup detection and enforcement for better memory management
 */

import { LIFECYCLE_PHASES, analyzeCleanupNeeds, isLifecycleAware } from './ICleanable.js';
import { isExtensionContextValid } from '../utils/chromeApiSafe.js';

/**
 * Cleanup enforcement policies
 */
export const ENFORCEMENT_POLICIES = {
  PASSIVE: 'passive',     // Only monitor and log
  ACTIVE: 'active',       // Automatically trigger cleanup
  AGGRESSIVE: 'aggressive' // Force cleanup with fallbacks
};

/**
 * Memory leak detection thresholds
 */
export const LEAK_THRESHOLDS = {
  EVENT_LISTENERS: 50,
  TIMERS: 20,
  DOM_NODES: 100,
  MEMORY_MB: 50,
  MODULE_AGE_MS: 600000 // 10 minutes
};

/**
 * Automatic cleanup enforcement system
 */
export class AutomaticCleanupEnforcer {
  constructor(options = {}) {
    this.options = {
      policy: options.policy || ENFORCEMENT_POLICIES.ACTIVE,
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      maxModuleAge: options.maxModuleAge || LEAK_THRESHOLDS.MODULE_AGE_MS,
      enableMemoryPressureDetection: options.enableMemoryPressureDetection !== false,
      enableDOMLeakDetection: options.enableDOMLeakDetection !== false,
      enableTimerLeakDetection: options.enableTimerLeakDetection !== false,
      ...options
    };
    
    this.registeredModules = new Map();
    this.leakDetectionResults = new Map();
    this.monitoringTimer = null;
    this.isMonitoring = false;
    this.memoryBaseline = null;
    
    // Performance tracking
    this.performanceMetrics = {
      detectionsPerformed: 0,
      leaksDetected: 0,
      automaticCleanups: 0,
      enforcementFailures: 0
    };
    
    console.log('OriginalUI: AutomaticCleanupEnforcer initialized with policy:', this.options.policy);
  }
  
  /**
   * Register a module for automatic cleanup monitoring
   * @param {object} module - Module to monitor
   * @param {string} moduleId - Unique identifier for the module
   * @param {object} metadata - Additional metadata about the module
   */
  registerModule(module, moduleId, metadata = {}) {
    if (!module || typeof module !== 'object') {
      console.warn('OriginalUI: Cannot register invalid module for cleanup monitoring');
      return false;
    }
    
    const registrationInfo = {
      module,
      moduleId,
      registeredAt: Date.now(),
      metadata,
      lastCheck: null,
      checkCount: 0,
      leakHistory: [],
      cleanupAttempts: 0
    };
    
    this.registeredModules.set(moduleId, registrationInfo);
    
    // Perform initial analysis
    this.analyzeModule(registrationInfo);
    
    console.log(`OriginalUI: Registered module ${moduleId} for cleanup monitoring`);
    return true;
  }
  
  /**
   * Unregister a module from monitoring
   * @param {string} moduleId - Module ID to unregister
   */
  unregisterModule(moduleId) {
    if (this.registeredModules.has(moduleId)) {
      this.registeredModules.delete(moduleId);
      this.leakDetectionResults.delete(moduleId);
      console.log(`OriginalUI: Unregistered module ${moduleId} from cleanup monitoring`);
      return true;
    }
    return false;
  }
  
  /**
   * Start automatic monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.warn('OriginalUI: Cleanup monitoring already active');
      return;
    }
    
    this.isMonitoring = true;
    this.memoryBaseline = this.getMemoryUsage();
    
    this.monitoringTimer = setInterval(() => {
      this.performMonitoringCycle();
    }, this.options.monitoringInterval);
    
    console.log('OriginalUI: Started automatic cleanup monitoring');
  }
  
  /**
   * Stop automatic monitoring
   */
  stopMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    this.isMonitoring = false;
    console.log('OriginalUI: Stopped automatic cleanup monitoring');
  }
  
  /**
   * Perform a full monitoring cycle
   */
  performMonitoringCycle() {
    if (!isExtensionContextValid()) {
      console.debug('OriginalUI: Extension context invalid, skipping monitoring cycle');
      return;
    }
    
    const startTime = Date.now();
    let detectedLeaks = 0;
    let enforcedCleanups = 0;
    
    console.debug('OriginalUI: Starting cleanup monitoring cycle...');
    
    for (const [moduleId, registrationInfo] of this.registeredModules) {
      try {
        const analysisResult = this.analyzeModule(registrationInfo);
        
        if (analysisResult.hasLeaks) {
          detectedLeaks++;
          this.handleDetectedLeak(moduleId, registrationInfo, analysisResult);
        }
        
        if (analysisResult.cleanupTriggered) {
          enforcedCleanups++;
        }
        
      } catch (error) {
        console.warn(`OriginalUI: Error analyzing module ${moduleId}:`, error);
        this.performanceMetrics.enforcementFailures++;
      }
    }
    
    const cycleTime = Date.now() - startTime;
    this.performanceMetrics.detectionsPerformed++;
    this.performanceMetrics.leaksDetected += detectedLeaks;
    this.performanceMetrics.automaticCleanups += enforcedCleanups;
    
    if (detectedLeaks > 0 || enforcedCleanups > 0) {
      console.log(`OriginalUI: Monitoring cycle completed in ${cycleTime}ms - Leaks: ${detectedLeaks}, Cleanups: ${enforcedCleanups}`);
    }
  }
  
  /**
   * Analyze a module for potential memory leaks
   * @param {object} registrationInfo - Module registration information
   * @returns {object} Analysis results
   */
  analyzeModule(registrationInfo) {
    const { module, moduleId, registeredAt } = registrationInfo;
    const now = Date.now();
    
    registrationInfo.lastCheck = now;
    registrationInfo.checkCount++;
    
    const analysisResult = {
      timestamp: now,
      moduleAge: now - registeredAt,
      hasLeaks: false,
      leakTypes: [],
      riskLevel: 'low',
      cleanupTriggered: false,
      recommendations: []
    };
    
    // Age-based leak detection
    if (analysisResult.moduleAge > this.options.maxModuleAge) {
      analysisResult.hasLeaks = true;
      analysisResult.leakTypes.push('age_exceeded');
      analysisResult.recommendations.push('Module exceeded maximum age threshold');
    }
    
    // Lifecycle-based analysis
    if (isLifecycleAware(module)) {
      const lifecyclePhase = module.getLifecyclePhase();
      if (lifecyclePhase === LIFECYCLE_PHASES.ERROR) {
        analysisResult.hasLeaks = true;
        analysisResult.leakTypes.push('error_state');
        analysisResult.riskLevel = 'high';
        analysisResult.recommendations.push('Module in error state should be cleaned up');
      }
    }
    
    // Memory analysis
    const cleanupNeeds = analyzeCleanupNeeds(module);
    if (cleanupNeeds.riskLevel === 'high') {
      analysisResult.hasLeaks = true;
      analysisResult.leakTypes.push('high_risk_resources');
      analysisResult.riskLevel = 'high';
      analysisResult.recommendations.push(...cleanupNeeds.recommendations);
    }
    
    // DOM leak detection
    if (this.options.enableDOMLeakDetection) {
      const domLeaks = this.detectDOMLeaks(module, moduleId);
      if (domLeaks.hasLeaks) {
        analysisResult.hasLeaks = true;
        analysisResult.leakTypes.push('dom_leaks');
        analysisResult.recommendations.push(...domLeaks.recommendations);
      }
    }
    
    // Timer leak detection
    if (this.options.enableTimerLeakDetection) {
      const timerLeaks = this.detectTimerLeaks(module, moduleId);
      if (timerLeaks.hasLeaks) {
        analysisResult.hasLeaks = true;
        analysisResult.leakTypes.push('timer_leaks');
        analysisResult.recommendations.push(...timerLeaks.recommendations);
      }
    }
    
    // Store analysis result
    this.leakDetectionResults.set(moduleId, analysisResult);
    registrationInfo.leakHistory.push(analysisResult);
    
    // Keep only last 10 analysis results
    if (registrationInfo.leakHistory.length > 10) {
      registrationInfo.leakHistory.shift();
    }
    
    return analysisResult;
  }
  
  /**
   * Handle detected memory leak
   * @param {string} moduleId - Module ID with leak
   * @param {object} registrationInfo - Module registration info
   * @param {object} analysisResult - Leak analysis results
   */
  handleDetectedLeak(moduleId, registrationInfo, analysisResult) {
    const { module } = registrationInfo;
    
    console.warn(`OriginalUI: Memory leak detected in module ${moduleId}:`, {
      leakTypes: analysisResult.leakTypes,
      riskLevel: analysisResult.riskLevel,
      recommendations: analysisResult.recommendations
    });
    
    switch (this.options.policy) {
      case ENFORCEMENT_POLICIES.PASSIVE:
        // Just log, no action
        break;
        
      case ENFORCEMENT_POLICIES.ACTIVE:
        if (analysisResult.riskLevel === 'high') {
          this.attemptAutomaticCleanup(moduleId, registrationInfo, analysisResult);
        }
        break;
        
      case ENFORCEMENT_POLICIES.AGGRESSIVE:
        this.attemptAutomaticCleanup(moduleId, registrationInfo, analysisResult);
        break;
    }
  }
  
  /**
   * Attempt automatic cleanup of a module
   * @param {string} moduleId - Module ID to clean up
   * @param {object} registrationInfo - Module registration info
   * @param {object} analysisResult - Analysis results
   */
  attemptAutomaticCleanup(moduleId, registrationInfo, analysisResult) {
    const { module } = registrationInfo;
    registrationInfo.cleanupAttempts++;
    
    try {
      console.log(`OriginalUI: Attempting automatic cleanup of module ${moduleId} (attempt ${registrationInfo.cleanupAttempts})`);
      
      // Set cleanup phase if lifecycle aware
      if (isLifecycleAware(module)) {
        module.setLifecyclePhase(LIFECYCLE_PHASES.CLEANUP_PENDING);
      }
      
      // Attempt cleanup
      if (typeof module.cleanup === 'function') {
        const cleanupStart = Date.now();
        
        // Use timeout to prevent hanging
        const cleanupPromise = Promise.resolve(module.cleanup());
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Cleanup timeout')), 5000);
        });
        
        Promise.race([cleanupPromise, timeoutPromise])
          .then(() => {
            const cleanupTime = Date.now() - cleanupStart;
            console.log(`OriginalUI: Successfully cleaned up module ${moduleId} (${cleanupTime}ms)`);
            
            // Mark as cleaned
            if (isLifecycleAware(module)) {
              module.setLifecyclePhase(LIFECYCLE_PHASES.CLEANED);
            }
            
            analysisResult.cleanupTriggered = true;
          })
          .catch((error) => {
            console.error(`OriginalUI: Failed to cleanup module ${moduleId}:`, error);
            
            if (isLifecycleAware(module)) {
              module.setLifecyclePhase(LIFECYCLE_PHASES.ERROR);
            }
            
            this.performanceMetrics.enforcementFailures++;
          });
      } else {
        console.warn(`OriginalUI: Module ${moduleId} does not have cleanup method`);
        this.performanceMetrics.enforcementFailures++;
      }
      
    } catch (error) {
      console.error(`OriginalUI: Error during automatic cleanup of ${moduleId}:`, error);
      this.performanceMetrics.enforcementFailures++;
    }
  }
  
  /**
   * Detect DOM-related memory leaks
   * @param {object} module - Module to analyze
   * @param {string} moduleId - Module ID
   * @returns {object} DOM leak detection results
   */
  detectDOMLeaks(module, moduleId) {
    const result = {
      hasLeaks: false,
      recommendations: [],
      details: {}
    };
    
    try {
      // Check for retained DOM elements
      if (module.elements || module.domElements) {
        const elements = module.elements || module.domElements;
        const retainedElements = [];
        
        if (Array.isArray(elements)) {
          elements.forEach((element, index) => {
            if (element && !element.isConnected) {
              retainedElements.push(index);
            }
          });
        } else if (elements instanceof HTMLElement && !elements.isConnected) {
          retainedElements.push('root');
        }
        
        if (retainedElements.length > 0) {
          result.hasLeaks = true;
          result.recommendations.push(`Remove ${retainedElements.length} retained DOM elements`);
          result.details.retainedElements = retainedElements;
        }
      }
      
      // Check for MutationObserver leaks
      if (module.observer || module.mutationObserver || module.observers) {
        const observers = [module.observer, module.mutationObserver, ...(module.observers || [])].filter(Boolean);
        if (observers.length > 5) { // Arbitrary threshold
          result.hasLeaks = true;
          result.recommendations.push(`Disconnect ${observers.length} mutation observers`);
          result.details.observerCount = observers.length;
        }
      }
      
    } catch (error) {
      console.debug(`OriginalUI: Error during DOM leak detection for ${moduleId}:`, error);
    }
    
    return result;
  }
  
  /**
   * Detect timer-related memory leaks
   * @param {object} module - Module to analyze
   * @param {string} moduleId - Module ID
   * @returns {object} Timer leak detection results
   */
  detectTimerLeaks(module, moduleId) {
    const result = {
      hasLeaks: false,
      recommendations: [],
      details: {}
    };
    
    try {
      let timerCount = 0;
      
      // Check for timer references
      if (module.timerId || module.timers || module._timers) {
        const timers = [module.timerId, ...(module.timers || []), ...(module._timers || [])].filter(Boolean);
        timerCount = timers.length;
      }
      
      if (module.intervalId || module.intervals || module._intervals) {
        const intervals = [module.intervalId, ...(module.intervals || []), ...(module._intervals || [])].filter(Boolean);
        timerCount += intervals.length;
      }
      
      if (timerCount > LEAK_THRESHOLDS.TIMERS) {
        result.hasLeaks = true;
        result.recommendations.push(`Clear ${timerCount} active timers/intervals`);
        result.details.timerCount = timerCount;
      }
      
    } catch (error) {
      console.debug(`OriginalUI: Error during timer leak detection for ${moduleId}:`, error);
    }
    
    return result;
  }
  
  /**
   * Get current memory usage (if available)
   * @returns {object|null} Memory usage information
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };
    }
    return null;
  }
  
  /**
   * Get monitoring statistics
   * @returns {object} Monitoring statistics
   */
  getStats() {
    const currentMemory = this.getMemoryUsage();
    const moduleStats = {};
    
    for (const [moduleId, info] of this.registeredModules) {
      moduleStats[moduleId] = {
        age: Date.now() - info.registeredAt,
        checkCount: info.checkCount,
        cleanupAttempts: info.cleanupAttempts,
        lastAnalysis: this.leakDetectionResults.get(moduleId),
        recentLeaks: info.leakHistory.filter(l => l.hasLeaks).length
      };
    }
    
    return {
      isMonitoring: this.isMonitoring,
      registeredModules: this.registeredModules.size,
      memoryUsage: {
        baseline: this.memoryBaseline,
        current: currentMemory,
        change: currentMemory && this.memoryBaseline ? 
          currentMemory.used - this.memoryBaseline.used : null
      },
      performance: this.performanceMetrics,
      moduleStats,
      options: this.options
    };
  }
  
  /**
   * Clean up the enforcer itself
   */
  cleanup() {
    console.log('OriginalUI: Cleaning up AutomaticCleanupEnforcer...');
    
    this.stopMonitoring();
    this.registeredModules.clear();
    this.leakDetectionResults.clear();
    
    this.performanceMetrics = {
      detectionsPerformed: 0,
      leaksDetected: 0,
      automaticCleanups: 0,
      enforcementFailures: 0
    };
    
    console.log('OriginalUI: AutomaticCleanupEnforcer cleaned up');
  }
}