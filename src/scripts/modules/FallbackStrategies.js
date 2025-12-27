/**
 * Fallback Strategies for Critical Functions
 * Provides comprehensive fallback mechanisms for when primary systems fail
 * @fileoverview Implements graceful degradation and recovery patterns
 */

import { isExtensionContextValid } from '../utils/chromeApiSafe.js';
import { LIFECYCLE_PHASES, CleanableModule } from './ICleanable.js';

/**
 * Fallback strategy types
 */
export const FALLBACK_TYPES = {
  GRACEFUL_DEGRADATION: 'graceful_degradation',
  ALTERNATIVE_IMPLEMENTATION: 'alternative_implementation',
  CACHED_RESPONSE: 'cached_response',
  DEFAULT_VALUE: 'default_value',
  BYPASS: 'bypass',
  OFFLINE_MODE: 'offline_mode'
};

/**
 * Operation priorities for fallback selection
 */
export const OPERATION_PRIORITIES = {
  CRITICAL: 'critical',     // Must not fail - use strongest fallbacks
  HIGH: 'high',            // Important - use multiple fallback layers
  MEDIUM: 'medium',        // Normal - use basic fallbacks
  LOW: 'low'               // Optional - can fail gracefully
};

/**
 * Fallback strategy manager for critical functions
 */
export class FallbackStrategyManager extends CleanableModule {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableCaching: options.enableCaching !== false,
      cacheTimeout: options.cacheTimeout || 300000, // 5 minutes
      maxCacheSize: options.maxCacheSize || 100,
      enableMetrics: options.enableMetrics !== false,
      enableHealthCheck: options.enableHealthCheck !== false,
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      ...options
    };
    
    // Strategy registry
    this.strategies = new Map();
    this.operationConfig = new Map();
    
    // Caching system for fallback responses
    this.cache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
    
    // Metrics and monitoring
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      fallbacksUsed: 0,
      strategyUsage: {},
      lastHealthCheck: null,
      systemHealth: 'unknown'
    };
    
    // Health monitoring
    this.healthMonitor = null;
    
    // Register default strategies
    this.registerDefaultStrategies();
    
    if (this.options.enableHealthCheck) {
      this.startHealthMonitoring();
    }
    
    console.log('OriginalUI: FallbackStrategyManager initialized');
  }
  
  /**
   * Register a fallback strategy for an operation
   * @param {string} operationId - Unique identifier for the operation
   * @param {object} config - Operation configuration
   * @param {function} primaryFunction - Primary function to execute
   * @param {Array} fallbackStrategies - Array of fallback strategies
   */
  register(operationId, config, primaryFunction, fallbackStrategies = []) {
    if (!operationId || typeof primaryFunction !== 'function') {
      throw new Error('Invalid operation registration parameters');
    }
    
    const operationConfig = {
      id: operationId,
      priority: config.priority || OPERATION_PRIORITIES.MEDIUM,
      timeout: config.timeout || 5000,
      retryCount: config.retryCount || 2,
      primaryFunction,
      fallbackStrategies: fallbackStrategies.map(strategy => ({
        type: strategy.type,
        implementation: strategy.implementation,
        condition: strategy.condition || (() => true),
        weight: strategy.weight || 1,
        description: strategy.description || ''
      })),
      enableCaching: config.enableCaching !== false,
      cacheKey: config.cacheKey || operationId,
      registeredAt: Date.now()
    };
    
    this.operationConfig.set(operationId, operationConfig);
    
    // Initialize metrics for this operation
    if (!this.metrics.strategyUsage[operationId]) {
      this.metrics.strategyUsage[operationId] = {
        primarySuccess: 0,
        primaryFailure: 0,
        fallbackUsage: {},
        lastUsed: null
      };
    }
    
    console.log(`OriginalUI: Registered fallback strategy for operation: ${operationId}`);
  }
  
  /**
   * Execute an operation with fallback protection
   * @param {string} operationId - Operation identifier
   * @param {object} context - Execution context and parameters
   * @returns {Promise} Operation result
   */
  async execute(operationId, context = {}) {
    const config = this.operationConfig.get(operationId);
    if (!config) {
      throw new Error(`No configuration found for operation: ${operationId}`);
    }
    
    this.metrics.totalOperations++;
    const operationStats = this.metrics.strategyUsage[operationId];
    operationStats.lastUsed = Date.now();
    
    const startTime = Date.now();
    
    try {
      // Check cache first if enabled
      if (config.enableCaching && this.options.enableCaching) {
        const cachedResult = this.getCachedResult(config.cacheKey, context);
        if (cachedResult !== null) {
          this.cacheStats.hits++;
          console.debug(`OriginalUI: Cache hit for operation ${operationId}`);
          return cachedResult;
        }
        this.cacheStats.misses++;
      }
      
      // Attempt primary function with timeout
      const primaryResult = await this.executeWithTimeout(
        () => config.primaryFunction(context),
        config.timeout,
        `Primary function timeout for ${operationId}`
      );
      
      // Primary success
      operationStats.primarySuccess++;
      this.metrics.successfulOperations++;
      
      // Cache result if applicable
      if (config.enableCaching && this.options.enableCaching) {
        this.setCachedResult(config.cacheKey, context, primaryResult);
      }
      
      const duration = Date.now() - startTime;
      console.debug(`OriginalUI: Primary function succeeded for ${operationId} (${duration}ms)`);
      
      return primaryResult;
      
    } catch (primaryError) {
      operationStats.primaryFailure++;
      
      console.warn(`OriginalUI: Primary function failed for ${operationId}:`, primaryError.message);
      
      // Execute fallback strategies
      return this.executeFallbacks(config, context, primaryError, startTime);
    }
  }
  
  /**
   * Execute fallback strategies in order of priority
   * @param {object} config - Operation configuration
   * @param {object} context - Execution context
   * @param {Error} primaryError - Error from primary function
   * @param {number} startTime - Operation start time
   * @returns {Promise} Fallback result
   */
  async executeFallbacks(config, context, primaryError, startTime) {
    const { operationId, fallbackStrategies, priority } = config;
    const operationStats = this.metrics.strategyUsage[operationId];
    
    if (fallbackStrategies.length === 0) {
      const duration = Date.now() - startTime;
      console.error(`OriginalUI: No fallback strategies available for ${operationId} (${duration}ms)`);
      throw primaryError;
    }
    
    // Sort strategies by weight and priority
    const sortedStrategies = [...fallbackStrategies]
      .filter(strategy => strategy.condition(context, primaryError))
      .sort((a, b) => {
        // Critical operations get stronger fallbacks first
        if (priority === OPERATION_PRIORITIES.CRITICAL) {
          return b.weight - a.weight;
        }
        return a.weight - b.weight;
      });
    
    if (sortedStrategies.length === 0) {
      console.error(`OriginalUI: No applicable fallback strategies for ${operationId}`);
      throw primaryError;
    }
    
    // Try each fallback strategy
    for (let i = 0; i < sortedStrategies.length; i++) {
      const strategy = sortedStrategies[i];
      
      try {
        console.log(`OriginalUI: Trying fallback strategy ${strategy.type} for ${operationId} (${i + 1}/${sortedStrategies.length})`);
        
        const fallbackResult = await this.executeWithTimeout(
          () => strategy.implementation(context, primaryError),
          config.timeout,
          `Fallback strategy ${strategy.type} timeout`
        );
        
        // Fallback success
        this.metrics.fallbacksUsed++;
        
        if (!operationStats.fallbackUsage[strategy.type]) {
          operationStats.fallbackUsage[strategy.type] = 0;
        }
        operationStats.fallbackUsage[strategy.type]++;
        
        // Cache result if applicable
        if (config.enableCaching && this.options.enableCaching) {
          this.setCachedResult(config.cacheKey, context, fallbackResult, strategy.type);
        }
        
        const duration = Date.now() - startTime;
        console.log(`OriginalUI: Fallback strategy ${strategy.type} succeeded for ${operationId} (${duration}ms)`);
        
        return fallbackResult;
        
      } catch (fallbackError) {
        console.warn(`OriginalUI: Fallback strategy ${strategy.type} failed for ${operationId}:`, fallbackError.message);
        
        // Continue to next strategy unless this is the last one
        if (i === sortedStrategies.length - 1) {
          const duration = Date.now() - startTime;
          console.error(`OriginalUI: All fallback strategies exhausted for ${operationId} (${duration}ms)`);
          throw primaryError; // Throw original error
        }
      }
    }
  }
  
  /**
   * Execute function with timeout protection
   * @param {function} fn - Function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} timeoutMessage - Timeout error message
   * @returns {Promise} Function result
   */
  async executeWithTimeout(fn, timeout, timeoutMessage) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), timeout);
      })
    ]);
  }
  
  /**
   * Register default fallback strategies
   */
  registerDefaultStrategies() {
    // Storage operation fallbacks
    this.register('chrome_storage_get', {
      priority: OPERATION_PRIORITIES.HIGH,
      timeout: 3000
    }, 
    // Primary function placeholder - will be set by actual usage
    async (context) => { throw new Error('Primary function not set'); },
    [
      {
        type: FALLBACK_TYPES.CACHED_RESPONSE,
        implementation: async (context) => {
          // Return cached data if available
          const cached = this.getCachedResult('storage_emergency_cache', context);
          if (cached) return cached;
          throw new Error('No emergency cache available');
        },
        weight: 1,
        description: 'Emergency cache fallback'
      },
      {
        type: FALLBACK_TYPES.DEFAULT_VALUE,
        implementation: async (context) => {
          // Return sensible defaults
          return context.defaultValues || {};
        },
        weight: 2,
        description: 'Default values fallback'
      }
    ]);
    
    // Extension context validation fallbacks
    this.register('extension_context_check', {
      priority: OPERATION_PRIORITIES.CRITICAL,
      timeout: 1000
    },
    async () => isExtensionContextValid(),
    [
      {
        type: FALLBACK_TYPES.GRACEFUL_DEGRADATION,
        implementation: async () => {
          // Return false but allow system to continue in degraded mode
          console.warn('OriginalUI: Extension context validation failed, entering degraded mode');
          return false;
        },
        weight: 1,
        description: 'Graceful degradation to offline mode'
      }
    ]);
    
    // DOM operation fallbacks
    this.register('dom_query_safe', {
      priority: OPERATION_PRIORITIES.MEDIUM,
      timeout: 2000
    },
    async (context) => document.querySelectorAll(context.selector),
    [
      {
        type: FALLBACK_TYPES.ALTERNATIVE_IMPLEMENTATION,
        implementation: async (context) => {
          // Try alternative selectors
          const alternativeSelectors = context.alternativeSelectors || [];
          for (const selector of alternativeSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) return elements;
            } catch (e) {
              console.debug(`Alternative selector failed: ${selector}`);
            }
          }
          return document.createDocumentFragment(); // Empty result
        },
        weight: 1,
        description: 'Alternative selector fallback'
      },
      {
        type: FALLBACK_TYPES.DEFAULT_VALUE,
        implementation: async () => document.createDocumentFragment(),
        weight: 2,
        description: 'Empty document fragment fallback'
      }
    ]);
  }
  
  /**
   * Get cached result if available and not expired
   * @param {string} cacheKey - Cache key
   * @param {object} context - Execution context
   * @returns {*} Cached result or null
   */
  getCachedResult(cacheKey, context) {
    const fullKey = this.generateCacheKey(cacheKey, context);
    const cached = this.cache.get(fullKey);
    
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.options.cacheTimeout) {
      this.cache.delete(fullKey);
      this.cacheStats.evictions++;
      return null;
    }
    
    return cached.data;
  }
  
  /**
   * Set cached result
   * @param {string} cacheKey - Cache key
   * @param {object} context - Execution context
   * @param {*} data - Data to cache
   * @param {string} strategy - Strategy used (optional)
   */
  setCachedResult(cacheKey, context, data, strategy = 'primary') {
    const fullKey = this.generateCacheKey(cacheKey, context);
    
    // Enforce cache size limits
    if (this.cache.size >= this.options.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.cacheStats.evictions++;
    }
    
    this.cache.set(fullKey, {
      data,
      timestamp: Date.now(),
      strategy
    });
  }
  
  /**
   * Generate cache key from base key and context
   * @param {string} baseKey - Base cache key
   * @param {object} context - Execution context
   * @returns {string} Full cache key
   */
  generateCacheKey(baseKey, context) {
    const contextStr = JSON.stringify(context, Object.keys(context).sort());
    return `${baseKey}:${this.hashString(contextStr)}`;
  }
  
  /**
   * Simple string hash function
   * @param {string} str - String to hash
   * @returns {string} Hash string
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthMonitor) return;
    
    this.healthMonitor = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
    
    console.log('OriginalUI: Started fallback system health monitoring');
  }
  
  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthMonitor) {
      clearInterval(this.healthMonitor);
      this.healthMonitor = null;
      console.log('OriginalUI: Stopped fallback system health monitoring');
    }
  }
  
  /**
   * Perform system health check
   */
  performHealthCheck() {
    const now = Date.now();
    this.metrics.lastHealthCheck = now;
    
    // Calculate success rate
    const totalOps = this.metrics.totalOperations;
    const successOps = this.metrics.successfulOperations;
    const successRate = totalOps > 0 ? (successOps / totalOps) : 1;
    
    // Calculate fallback usage rate
    const fallbackRate = totalOps > 0 ? (this.metrics.fallbacksUsed / totalOps) : 0;
    
    // Determine system health
    if (successRate >= 0.95 && fallbackRate <= 0.1) {
      this.metrics.systemHealth = 'healthy';
    } else if (successRate >= 0.8 && fallbackRate <= 0.3) {
      this.metrics.systemHealth = 'degraded';
    } else {
      this.metrics.systemHealth = 'unhealthy';
    }
    
    console.debug(`OriginalUI: System health check: ${this.metrics.systemHealth} (success: ${(successRate * 100).toFixed(1)}%, fallbacks: ${(fallbackRate * 100).toFixed(1)}%)`);
  }
  
  /**
   * Get comprehensive system statistics
   * @returns {object} System statistics
   */
  getStats() {
    const now = Date.now();
    
    return {
      operations: {
        total: this.metrics.totalOperations,
        successful: this.metrics.successfulOperations,
        fallbacksUsed: this.metrics.fallbacksUsed,
        successRate: this.metrics.totalOperations > 0 ? 
          ((this.metrics.successfulOperations / this.metrics.totalOperations) * 100).toFixed(1) + '%' : '100%',
        fallbackRate: this.metrics.totalOperations > 0 ? 
          ((this.metrics.fallbacksUsed / this.metrics.totalOperations) * 100).toFixed(1) + '%' : '0%'
      },
      cache: {
        ...this.cacheStats,
        size: this.cache.size,
        maxSize: this.options.maxCacheSize,
        hitRate: (this.cacheStats.hits + this.cacheStats.misses) > 0 ? 
          ((this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100).toFixed(1) + '%' : '0%'
      },
      health: {
        status: this.metrics.systemHealth,
        lastCheck: this.metrics.lastHealthCheck,
        timeSinceLastCheck: this.metrics.lastHealthCheck ? now - this.metrics.lastHealthCheck : null
      },
      registeredOperations: this.operationConfig.size,
      strategyUsage: this.metrics.strategyUsage,
      lifecycle: this.getLifecycleStats()
    };
  }
  
  /**
   * Clear all caches and reset metrics
   */
  reset() {
    this.cache.clear();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
    
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      fallbacksUsed: 0,
      strategyUsage: {},
      lastHealthCheck: null,
      systemHealth: 'unknown'
    };
    
    console.log('OriginalUI: FallbackStrategyManager reset completed');
  }
  
  /**
   * Enhanced cleanup
   */
  cleanup() {
    console.log('OriginalUI: Starting FallbackStrategyManager cleanup...');
    
    this.setLifecyclePhase(LIFECYCLE_PHASES.CLEANUP_PENDING);
    
    try {
      // Stop health monitoring
      this.stopHealthMonitoring();
      
      // Get final stats
      const finalStats = this.getStats();
      
      // Clear all data
      this.operationConfig.clear();
      this.strategies.clear();
      this.cache.clear();
      
      // Reset metrics
      this.reset();
      
      // Call parent cleanup
      super.cleanup();
      
      console.log('OriginalUI: FallbackStrategyManager cleanup completed:', {
        finalStats: {
          operations: finalStats.operations,
          health: finalStats.health,
          cacheSize: finalStats.cache.size
        }
      });
      
    } catch (error) {
      console.error('OriginalUI: Error during FallbackStrategyManager cleanup:', error);
      this.setLifecyclePhase(LIFECYCLE_PHASES.ERROR);
      throw error;
    }
  }
}

/**
 * Singleton instance for global use
 */
let globalFallbackManager = null;

/**
 * Get or create global fallback strategy manager
 * @param {object} options - Manager options
 * @returns {FallbackStrategyManager} Global manager instance
 */
export function getGlobalFallbackManager(options = {}) {
  if (!globalFallbackManager) {
    globalFallbackManager = new FallbackStrategyManager(options);
  }
  return globalFallbackManager;
}

/**
 * Clean up global fallback manager
 */
export function cleanupGlobalFallbackManager() {
  if (globalFallbackManager) {
    globalFallbackManager.cleanup();
    globalFallbackManager = null;
  }
}