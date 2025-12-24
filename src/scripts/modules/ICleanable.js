/**
 * Cleanable Interface Contract
 * Defines the contract for modules that require cleanup to prevent memory leaks
 */

/**
 * Lifecycle phases for cleanable modules
 */
export const LIFECYCLE_PHASES = {
  INITIALIZING: 'initializing',
  ACTIVE: 'active', 
  CLEANUP_PENDING: 'cleanup_pending',
  CLEANED: 'cleaned',
  ERROR: 'error'
};

/**
 * Enhanced interface check for cleanable objects with lifecycle support
 * @param {object} obj - Object to check
 * @returns {boolean} True if object has cleanup method
 */
export function isCleanable(obj) {
  return obj && typeof obj.cleanup === 'function';
}

/**
 * Check if object supports enhanced lifecycle hooks
 * @param {object} obj - Object to check
 * @returns {boolean} True if object supports lifecycle hooks
 */
export function isLifecycleAware(obj) {
  return isCleanable(obj) && 
    typeof obj.onPhaseChange === 'function' &&
    typeof obj.getLifecyclePhase === 'function';
}

/**
 * Automatic cleanup detection utility
 * @param {object} obj - Object to analyze
 * @returns {object} Analysis of potential memory leaks
 */
export function analyzeCleanupNeeds(obj) {
  const analysis = {
    hasEventListeners: false,
    hasTimers: false,
    hasObservers: false,
    hasAsyncOperations: false,
    riskLevel: 'low',
    recommendations: []
  };
  
  if (!obj) return analysis;
  
  // Check for event listeners
  if (obj.eventListeners || obj.listeners || obj._listeners) {
    analysis.hasEventListeners = true;
    analysis.recommendations.push('Remove event listeners in cleanup()');
  }
  
  // Check for timers/intervals
  if (obj.timerId || obj.intervalId || obj._timers) {
    analysis.hasTimers = true;
    analysis.recommendations.push('Clear timers/intervals in cleanup()');
  }
  
  // Check for observers (MutationObserver, IntersectionObserver, etc.)
  if (obj.observer || obj.observers || obj.mutationObserver) {
    analysis.hasObservers = true;
    analysis.recommendations.push('Disconnect observers in cleanup()');
  }
  
  // Check for async operations
  if (obj.pendingPromises || obj.abortController) {
    analysis.hasAsyncOperations = true;
    analysis.recommendations.push('Cancel pending async operations in cleanup()');
  }
  
  // Calculate risk level
  const riskFactors = [
    analysis.hasEventListeners,
    analysis.hasTimers,
    analysis.hasObservers,
    analysis.hasAsyncOperations
  ].filter(Boolean).length;
  
  if (riskFactors >= 3) analysis.riskLevel = 'high';
  else if (riskFactors >= 2) analysis.riskLevel = 'medium';
  
  return analysis;
}

/**
 * Enhanced base class for cleanable modules with lifecycle management
 */
export class CleanableModule {
  constructor() {
    this._lifecyclePhase = LIFECYCLE_PHASES.INITIALIZING;
    this._lifecycleListeners = new Set();
    this._cleanupAnalysis = null;
    this._lastPhaseChange = Date.now();
  }
  
  /**
   * Get current lifecycle phase
   * @returns {string} Current phase
   */
  getLifecyclePhase() {
    return this._lifecyclePhase;
  }
  
  /**
   * Set lifecycle phase and notify listeners
   * @param {string} newPhase - New lifecycle phase
   */
  setLifecyclePhase(newPhase) {
    const oldPhase = this._lifecyclePhase;
    this._lifecyclePhase = newPhase;
    this._lastPhaseChange = Date.now();
    
    // Notify listeners
    this._lifecycleListeners.forEach(listener => {
      try {
        listener(newPhase, oldPhase, this);
      } catch (error) {
        console.warn('JustUI: Error in lifecycle listener:', error);
      }
    });
    
    console.debug(`JustUI: ${this.constructor.name} lifecycle: ${oldPhase} -> ${newPhase}`);
  }
  
  /**
   * Add lifecycle phase change listener
   * @param {function} listener - Callback for phase changes
   */
  onPhaseChange(listener) {
    if (typeof listener === 'function') {
      this._lifecycleListeners.add(listener);
    }
  }
  
  /**
   * Remove lifecycle phase change listener
   * @param {function} listener - Listener to remove
   */
  offPhaseChange(listener) {
    this._lifecycleListeners.delete(listener);
  }
  
  /**
   * Analyze this module's cleanup needs
   * @returns {object} Cleanup analysis
   */
  analyzeCleanupNeeds() {
    if (!this._cleanupAnalysis) {
      this._cleanupAnalysis = analyzeCleanupNeeds(this);
    }
    return this._cleanupAnalysis;
  }
  
  /**
   * Initialize the module (sets phase to ACTIVE)
   */
  initialize() {
    this.setLifecyclePhase(LIFECYCLE_PHASES.ACTIVE);
  }
  
  /**
   * Clean up all resources, event listeners, observers, etc.
   * Must be implemented by subclasses
   */
  cleanup() {
    this.setLifecyclePhase(LIFECYCLE_PHASES.CLEANUP_PENDING);
    
    try {
      // Clean up lifecycle listeners
      this._lifecycleListeners.clear();
      this._cleanupAnalysis = null;
      
      this.setLifecyclePhase(LIFECYCLE_PHASES.CLEANED);
    } catch (error) {
      this.setLifecyclePhase(LIFECYCLE_PHASES.ERROR);
      throw error;
    }
  }
  
  /**
   * Check if this module is cleanable
   * @returns {boolean} Always true for CleanableModule instances
   */
  isCleanable() {
    return true;
  }
  
  /**
   * Get lifecycle statistics
   * @returns {object} Lifecycle stats
   */
  getLifecycleStats() {
    return {
      currentPhase: this._lifecyclePhase,
      lastPhaseChange: this._lastPhaseChange,
      timeSinceLastChange: Date.now() - this._lastPhaseChange,
      listenersCount: this._lifecycleListeners.size,
      cleanupAnalysis: this._cleanupAnalysis
    };
  }
}

/**
 * Registry for managing cleanable modules with memory compartments
 * Implements scoped cleanup with time-based expiration and memory limits
 */
export class CleanupRegistry {
  constructor(options = {}) {
    this.modules = new Set();
    
    // Memory compartment configuration
    this.options = {
      maxCompartmentSize: options.maxCompartmentSize || 100,
      compartmentTTL: options.compartmentTTL || 300000, // 5 minutes
      cleanupInterval: options.cleanupInterval || 60000, // 1 minute
      enablePeriodicCleanup: options.enablePeriodicCleanup !== false
    };
    
    // Compartmentalized storage for different types of modules
    this.compartments = new Map();
    this.registrationTimes = new WeakMap(); // Auto-cleanup when modules are GC'd
    this.cleanupHistory = [];
    
    // Periodic cleanup timer
    this.cleanupTimer = null;
    
    if (this.options.enablePeriodicCleanup) {
      this.startPeriodicCleanup();
    }
  }
  
  /**
   * Register a module for cleanup with compartmentalization and automatic detection
   * @param {object} module - Module to register (must have cleanup method)
   * @param {string} name - Optional name for debugging
   * @param {string} compartment - Compartment category (e.g., 'protection', 'analysis', 'tracking')
   * @param {object} options - Registration options
   */
  register(module, name = 'unnamed', compartment = 'default', options = {}) {
    if (!isCleanable(module)) {
      console.warn(`JustUI: Module ${name} does not implement cleanup interface`);
      return false;
    }
    
    // Analyze cleanup needs
    const cleanupAnalysis = analyzeCleanupNeeds(module);
    if (cleanupAnalysis.riskLevel === 'high') {
      console.warn(`JustUI: High memory leak risk detected for ${name}:`, cleanupAnalysis.recommendations);
    }
    
    // Create compartment if it doesn't exist
    if (!this.compartments.has(compartment)) {
      this.compartments.set(compartment, {
        modules: new Set(),
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        totalMemoryRisk: 0
      });
    }
    
    const compartmentData = this.compartments.get(compartment);
    const moduleEntry = { 
      module, 
      name, 
      compartment, 
      registeredAt: Date.now(),
      cleanupAnalysis,
      options: {
        autoCleanup: options.autoCleanup !== false,
        cleanupTimeout: options.cleanupTimeout || 30000, // 30s default
        priority: options.priority || 'normal'
      }
    };
    
    // Add to main registry and compartment
    this.modules.add(moduleEntry);
    compartmentData.modules.add(moduleEntry);
    compartmentData.lastAccessed = Date.now();
    
    // Update compartment memory risk score
    const riskScore = cleanupAnalysis.riskLevel === 'high' ? 3 : cleanupAnalysis.riskLevel === 'medium' ? 2 : 1;
    compartmentData.totalMemoryRisk += riskScore;
    
    // Track registration time for TTL management
    this.registrationTimes.set(module, Date.now());
    
    // Setup lifecycle monitoring if supported
    if (isLifecycleAware(module)) {
      module.onPhaseChange((newPhase, oldPhase) => {
        console.debug(`JustUI: Module ${name} lifecycle: ${oldPhase} -> ${newPhase}`);
        if (newPhase === LIFECYCLE_PHASES.ERROR) {
          console.warn(`JustUI: Module ${name} entered error state, scheduling cleanup`);
          if (moduleEntry.options.autoCleanup) {
            setTimeout(() => this.cleanupModule(moduleEntry), 1000);
          }
        }
      });
    }
    
    // Check compartment size limits
    this.enforceCompartmentLimits(compartment);
    
    console.log(`JustUI: Registered module ${name} in compartment ${compartment} (risk: ${cleanupAnalysis.riskLevel})`);
    return true;
  }
  
  /**
   * Unregister a module from all compartments
   * @param {object} module - Module to unregister
   */
  unregister(module) {
    for (const entry of this.modules) {
      if (entry.module === module) {
        this.modules.delete(entry);
        
        // Remove from compartment
        const compartmentData = this.compartments.get(entry.compartment);
        if (compartmentData) {
          compartmentData.modules.delete(entry);
          
          // Clean up empty compartments
          if (compartmentData.modules.size === 0) {
            this.compartments.delete(entry.compartment);
          }
        }
        break;
      }
    }
  }
  
  /**
   * Clean up all registered modules with priority ordering and timeout protection
   */
  cleanupAll() {
    const results = [];
    const moduleArray = Array.from(this.modules);
    
    // Sort by priority and compartment risk level
    moduleArray.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
      const aPriority = priorityOrder[a.options?.priority] || 2;
      const bPriority = priorityOrder[b.options?.priority] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // High priority first
      }
      
      // Then by cleanup analysis risk
      const aRisk = a.cleanupAnalysis?.riskLevel === 'high' ? 3 : a.cleanupAnalysis?.riskLevel === 'medium' ? 2 : 1;
      const bRisk = b.cleanupAnalysis?.riskLevel === 'high' ? 3 : b.cleanupAnalysis?.riskLevel === 'medium' ? 2 : 1;
      
      return bRisk - aRisk; // High risk first
    });
    
    // Process cleanup with timeout protection
    for (const moduleEntry of moduleArray) {
      const result = this.cleanupModule(moduleEntry);
      results.push(result);
    }
    
    // Clear all storage
    this.modules.clear();
    this.compartments.clear();
    this.cleanupHistory.push({
      timestamp: Date.now(),
      action: 'cleanupAll',
      results,
      totalProcessed: results.length
    });
    
    // Stop periodic cleanup
    this.stopPeriodicCleanup();
    
    console.log(`JustUI: Cleanup completed - ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }
  
  /**
   * Clean up a single module with timeout protection
   * @param {object} moduleEntry - Module entry to clean up
   * @returns {object} Cleanup result
   */
  cleanupModule(moduleEntry) {
    const { module, name, compartment, options } = moduleEntry;
    const startTime = Date.now();
    
    let cleanupPromise;
    
    try {
      // Set lifecycle phase if supported
      if (isLifecycleAware(module)) {
        module.setLifecyclePhase(LIFECYCLE_PHASES.CLEANUP_PENDING);
      }
      
      // Wrap cleanup in promise for timeout handling
      cleanupPromise = Promise.resolve(module.cleanup());
      
      // Add timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Cleanup timeout')), options.cleanupTimeout);
      });
      
      return Promise.race([cleanupPromise, timeoutPromise])
        .then(() => {
          const duration = Date.now() - startTime;
          console.log(`JustUI: Successfully cleaned up ${name} from ${compartment} (${duration}ms)`);
          return { name, compartment, success: true, duration, analysis: moduleEntry.cleanupAnalysis };
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          console.warn(`JustUI: Error cleaning up ${name}:`, error);
          return { name, compartment, success: false, error: error.message, duration };
        });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn(`JustUI: Synchronous error cleaning up ${name}:`, error);
      return { name, compartment, success: false, error: error.message, duration };
    }
  }
  
  /**
   * Get count of registered modules
   * @returns {number} Number of registered modules
   */
  getModuleCount() {
    return this.modules.size;
  }
  
  /**
   * Get names of registered modules
   * @returns {string[]} Array of module names
   */
  getModuleNames() {
    return Array.from(this.modules).map(entry => entry.name);
  }

  /**
   * Clean up specific compartment
   * @param {string} compartmentName - Name of compartment to clean
   */
  cleanupCompartment(compartmentName) {
    const compartmentData = this.compartments.get(compartmentName);
    if (!compartmentData) return { cleaned: 0, errors: 0 };

    const results = { cleaned: 0, errors: 0, modules: [] };

    for (const entry of compartmentData.modules) {
      try {
        entry.module.cleanup();
        this.modules.delete(entry);
        results.cleaned++;
        results.modules.push({ name: entry.name, success: true });
      } catch (error) {
        results.errors++;
        results.modules.push({ name: entry.name, success: false, error });
        console.warn(`JustUI: Error cleaning up ${entry.name}:`, error);
      }
    }

    this.compartments.delete(compartmentName);
    
    this.cleanupHistory.push({
      timestamp: Date.now(),
      action: 'cleanupCompartment',
      compartment: compartmentName,
      results
    });

    console.log(`JustUI: Compartment ${compartmentName} cleanup: ${results.cleaned} cleaned, ${results.errors} errors`);
    return results;
  }

  /**
   * Enforce size limits for a compartment using LRU eviction
   * @param {string} compartmentName - Name of compartment to check
   */
  enforceCompartmentLimits(compartmentName) {
    const compartmentData = this.compartments.get(compartmentName);
    if (!compartmentData) return;

    const moduleArray = Array.from(compartmentData.modules);
    
    if (moduleArray.length > this.options.maxCompartmentSize) {
      // Sort by registration time (oldest first)
      moduleArray.sort((a, b) => a.registeredAt - b.registeredAt);
      
      const excess = moduleArray.length - this.options.maxCompartmentSize;
      const toRemove = moduleArray.slice(0, excess);
      
      console.log(`JustUI: Compartment ${compartmentName} over limit, removing ${toRemove.length} oldest modules`);
      
      for (const entry of toRemove) {
        try {
          entry.module.cleanup();
          this.modules.delete(entry);
          compartmentData.modules.delete(entry);
        } catch (error) {
          console.warn(`JustUI: Error during LRU cleanup of ${entry.name}:`, error);
        }
      }
    }
  }

  /**
   * Start periodic cleanup based on TTL
   */
  startPeriodicCleanup() {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.options.cleanupInterval);
    
    console.log('JustUI: Started periodic cleanup');
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('JustUI: Stopped periodic cleanup');
    }
  }

  /**
   * Perform time-based cleanup of expired modules
   */
  performPeriodicCleanup() {
    const now = Date.now();
    const expiredCompartments = [];

    for (const [name, data] of this.compartments) {
      const age = now - data.lastAccessed;
      if (age > this.options.compartmentTTL) {
        expiredCompartments.push(name);
      }
    }

    if (expiredCompartments.length > 0) {
      console.log(`JustUI: Cleaning up ${expiredCompartments.length} expired compartments`);
      expiredCompartments.forEach(name => this.cleanupCompartment(name));
    }
  }

  /**
   * Get comprehensive memory usage and lifecycle statistics
   * @returns {object} Memory and compartment statistics
   */
  getMemoryStats() {
    const compartmentStats = {};
    let totalMemoryRisk = 0;
    let totalLifecycleAware = 0;
    const phaseDistribution = {};
    
    for (const [name, data] of this.compartments) {
      const moduleArray = Array.from(data.modules);
      const riskDistribution = { high: 0, medium: 0, low: 0 };
      const lifecycleStats = { aware: 0, phases: {} };
      
      moduleArray.forEach(entry => {
        // Risk analysis
        const risk = entry.cleanupAnalysis?.riskLevel || 'low';
        riskDistribution[risk]++;
        
        // Lifecycle analysis
        if (isLifecycleAware(entry.module)) {
          lifecycleStats.aware++;
          totalLifecycleAware++;
          
          const phase = entry.module.getLifecyclePhase();
          lifecycleStats.phases[phase] = (lifecycleStats.phases[phase] || 0) + 1;
          phaseDistribution[phase] = (phaseDistribution[phase] || 0) + 1;
        }
      });
      
      totalMemoryRisk += data.totalMemoryRisk || 0;
      
      compartmentStats[name] = {
        moduleCount: data.modules.size,
        age: Date.now() - data.createdAt,
        lastAccessed: Date.now() - data.lastAccessed,
        isExpired: (Date.now() - data.lastAccessed) > this.options.compartmentTTL,
        memoryRisk: data.totalMemoryRisk || 0,
        riskDistribution,
        lifecycleStats
      };
    }

    return {
      totalModules: this.modules.size,
      totalCompartments: this.compartments.size,
      totalMemoryRisk,
      totalLifecycleAware,
      phaseDistribution,
      compartments: compartmentStats,
      cleanupHistory: this.cleanupHistory.slice(-10),
      options: this.options,
      healthScore: this.calculateHealthScore()
    };
  }
  
  /**
   * Calculate overall health score of the cleanup registry
   * @returns {number} Health score from 0-100
   */
  calculateHealthScore() {
    if (this.modules.size === 0) return 100;
    
    let score = 100;
    const moduleArray = Array.from(this.modules);
    
    // Penalize high memory risk modules
    const highRiskCount = moduleArray.filter(entry => 
      entry.cleanupAnalysis?.riskLevel === 'high'
    ).length;
    score -= (highRiskCount / this.modules.size) * 30;
    
    // Penalize modules in error state
    const errorCount = moduleArray.filter(entry => 
      isLifecycleAware(entry.module) && 
      entry.module.getLifecyclePhase() === LIFECYCLE_PHASES.ERROR
    ).length;
    score -= (errorCount / this.modules.size) * 40;
    
    // Penalize expired compartments
    const expiredCompartments = Array.from(this.compartments.values())
      .filter(data => (Date.now() - data.lastAccessed) > this.options.compartmentTTL);
    score -= (expiredCompartments.length / this.compartments.size) * 20;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Enhanced cleanup method for the registry itself with verification
   */
  cleanup() {
    console.log('JustUI: Starting CleanupRegistry cleanup...');
    
    // Take pre-cleanup snapshot
    const preCleanupStats = this.getMemoryStats();
    
    // Cleanup all modules first
    const results = this.cleanupAll();
    
    // Clear cleanup history
    this.cleanupHistory = [];
    
    // Final verification
    const postCleanupStats = {
      totalModules: this.modules.size,
      totalCompartments: this.compartments.size,
      cleanupResults: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
    
    console.log('JustUI: CleanupRegistry cleanup completed:', {
      before: {
        modules: preCleanupStats.totalModules,
        compartments: preCleanupStats.totalCompartments,
        healthScore: preCleanupStats.healthScore
      },
      after: postCleanupStats,
      effectiveness: postCleanupStats.totalModules === 0 ? '100%' : 
        `${Math.round((1 - postCleanupStats.totalModules / preCleanupStats.totalModules) * 100)}%`
    });
    
    return postCleanupStats;
  }
}