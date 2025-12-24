/**
 * Centralized Event Listener Registry
 * Prevents memory leaks by tracking and managing all event listeners across modules
 * @fileoverview Provides centralized event listener management with automatic cleanup
 */

import { LIFECYCLE_PHASES, CleanableModule } from './ICleanable.js';
import { isExtensionContextValid } from '../utils/chromeApiSafe.js';

/**
 * Event listener priorities for cleanup ordering
 */
export const LISTENER_PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high', 
  NORMAL: 'normal',
  LOW: 'low'
};

/**
 * Event listener categories for organization
 */
export const LISTENER_CATEGORIES = {
  SECURITY: 'security',
  UI: 'ui',
  NAVIGATION: 'navigation',
  PERFORMANCE: 'performance',
  DEBUG: 'debug'
};

/**
 * Centralized registry for managing all event listeners
 */
export class EventListenerRegistry extends CleanableModule {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableLeakDetection: options.enableLeakDetection !== false,
      maxListenersPerElement: options.maxListenersPerElement || 50,
      maxListenersPerModule: options.maxListenersPerModule || 200,
      cleanupInterval: options.cleanupInterval || 60000, // 1 minute
      enableAutoCleanup: options.enableAutoCleanup !== false,
      warnThreshold: options.warnThreshold || 30,
      ...options
    };
    
    // Main registry storage
    this.listeners = new Map(); // listenerId -> listenerInfo
    this.elementListeners = new WeakMap(); // element -> Set of listenerIds
    this.moduleListeners = new Map(); // moduleId -> Set of listenerIds
    this.categoryListeners = new Map(); // category -> Set of listenerIds
    
    // Leak detection and performance tracking
    this.listenerStats = {
      totalRegistered: 0,
      totalRemoved: 0,
      activeCount: 0,
      leaksDetected: 0,
      autoCleanups: 0,
      lastLeakCheck: Date.now()
    };
    
    // Cleanup management
    this.cleanupTimer = null;
    this.nextListenerId = 1;
    this.orphanedListeners = new Set();
    
    if (this.options.enableAutoCleanup) {
      this.startPeriodicCleanup();
    }
    
    console.log('JustUI: EventListenerRegistry initialized');
  }
  
  /**
   * Register an event listener with comprehensive tracking
   * @param {Element|Window|Document} element - Target element
   * @param {string} eventType - Event type
   * @param {function} handler - Event handler function
   * @param {object|boolean} options - Event listener options or useCapture
   * @param {object} metadata - Additional metadata
   * @returns {string} Unique listener ID for removal
   */
  register(element, eventType, handler, options = {}, metadata = {}) {
    if (!element || typeof handler !== 'function') {
      console.warn('JustUI: Invalid parameters for event listener registration');
      return null;
    }
    
    // Parse options
    const listenerOptions = this.normalizeOptions(options);
    
    // Generate unique listener ID
    const listenerId = this.generateListenerId();
    
    // Create listener info
    const listenerInfo = {
      id: listenerId,
      element,
      eventType,
      handler,
      options: listenerOptions,
      metadata: {
        moduleId: metadata.moduleId || 'unknown',
        priority: metadata.priority || LISTENER_PRIORITIES.NORMAL,
        category: metadata.category || LISTENER_CATEGORIES.UI,
        description: metadata.description || '',
        createdAt: Date.now(),
        ...metadata
      },
      isActive: false,
      removeCount: 0
    };
    
    try {
      // Check for potential memory leaks before adding
      this.checkForPotentialLeaks(element, metadata.moduleId);
      
      // Add the actual event listener
      element.addEventListener(eventType, handler, listenerOptions);
      listenerInfo.isActive = true;
      
      // Register in all tracking systems
      this.listeners.set(listenerId, listenerInfo);
      this.trackElementListener(element, listenerId);
      this.trackModuleListener(metadata.moduleId || 'unknown', listenerId);
      this.trackCategoryListener(metadata.category || LISTENER_CATEGORIES.UI, listenerId);
      
      // Update statistics
      this.listenerStats.totalRegistered++;
      this.listenerStats.activeCount++;
      
      console.debug(`JustUI: Registered event listener ${listenerId} for ${eventType} on ${element.tagName || element.constructor.name}`);
      
      return listenerId;
      
    } catch (error) {
      console.error('JustUI: Error registering event listener:', error);
      return null;
    }
  }
  
  /**
   * Remove a specific event listener by ID
   * @param {string} listenerId - Listener ID to remove
   * @returns {boolean} True if successfully removed
   */
  remove(listenerId) {
    const listenerInfo = this.listeners.get(listenerId);
    if (!listenerInfo) {
      console.warn(`JustUI: Listener ${listenerId} not found for removal`);
      return false;
    }
    
    return this.removeListenerInfo(listenerInfo);
  }
  
  /**
   * Remove all listeners for a specific module
   * @param {string} moduleId - Module ID
   * @returns {number} Number of listeners removed
   */
  removeByModule(moduleId) {
    const moduleListenerIds = this.moduleListeners.get(moduleId);
    if (!moduleListenerIds) {
      return 0;
    }
    
    let removedCount = 0;
    for (const listenerId of moduleListenerIds) {
      const listenerInfo = this.listeners.get(listenerId);
      if (listenerInfo && this.removeListenerInfo(listenerInfo)) {
        removedCount++;
      }
    }
    
    console.log(`JustUI: Removed ${removedCount} listeners for module ${moduleId}`);
    return removedCount;
  }
  
  /**
   * Remove all listeners for a specific element
   * @param {Element} element - Target element
   * @returns {number} Number of listeners removed
   */
  removeByElement(element) {
    if (!element) return 0;
    
    const elementListenerIds = this.elementListeners.get(element);
    if (!elementListenerIds) {
      return 0;
    }
    
    let removedCount = 0;
    for (const listenerId of elementListenerIds) {
      const listenerInfo = this.listeners.get(listenerId);
      if (listenerInfo && this.removeListenerInfo(listenerInfo)) {
        removedCount++;
      }
    }
    
    console.debug(`JustUI: Removed ${removedCount} listeners from element`);
    return removedCount;
  }
  
  /**
   * Remove all listeners in a specific category
   * @param {string} category - Category to remove
   * @returns {number} Number of listeners removed
   */
  removeByCategory(category) {
    const categoryListenerIds = this.categoryListeners.get(category);
    if (!categoryListenerIds) {
      return 0;
    }
    
    let removedCount = 0;
    for (const listenerId of categoryListenerIds) {
      const listenerInfo = this.listeners.get(listenerId);
      if (listenerInfo && this.removeListenerInfo(listenerInfo)) {
        removedCount++;
      }
    }
    
    console.log(`JustUI: Removed ${removedCount} listeners in category ${category}`);
    return removedCount;
  }
  
  /**
   * Remove listener info and clean up all tracking
   * @param {object} listenerInfo - Listener information
   * @returns {boolean} True if successfully removed
   */
  removeListenerInfo(listenerInfo) {
    const { id, element, eventType, handler, options } = listenerInfo;
    
    try {
      // Remove the actual event listener
      if (listenerInfo.isActive) {
        element.removeEventListener(eventType, handler, options);
        listenerInfo.isActive = false;
        listenerInfo.removeCount++;
      }
      
      // Remove from all tracking systems
      this.listeners.delete(id);
      this.untrackElementListener(element, id);
      this.untrackModuleListener(listenerInfo.metadata.moduleId, id);
      this.untrackCategoryListener(listenerInfo.metadata.category, id);
      
      // Update statistics
      this.listenerStats.totalRemoved++;
      this.listenerStats.activeCount = Math.max(0, this.listenerStats.activeCount - 1);
      
      return true;
      
    } catch (error) {
      console.warn(`JustUI: Error removing listener ${id}:`, error);
      // Mark as orphaned if removal failed
      this.orphanedListeners.add(id);
      return false;
    }
  }
  
  /**
   * Track element listener relationship
   * @param {Element} element - Target element
   * @param {string} listenerId - Listener ID
   */
  trackElementListener(element, listenerId) {
    if (!this.elementListeners.has(element)) {
      this.elementListeners.set(element, new Set());
    }
    this.elementListeners.get(element).add(listenerId);
  }
  
  /**
   * Remove element listener tracking
   * @param {Element} element - Target element
   * @param {string} listenerId - Listener ID
   */
  untrackElementListener(element, listenerId) {
    const elementSet = this.elementListeners.get(element);
    if (elementSet) {
      elementSet.delete(listenerId);
      if (elementSet.size === 0) {
        this.elementListeners.delete(element);
      }
    }
  }
  
  /**
   * Track module listener relationship
   * @param {string} moduleId - Module ID
   * @param {string} listenerId - Listener ID
   */
  trackModuleListener(moduleId, listenerId) {
    if (!this.moduleListeners.has(moduleId)) {
      this.moduleListeners.set(moduleId, new Set());
    }
    this.moduleListeners.get(moduleId).add(listenerId);
  }
  
  /**
   * Remove module listener tracking
   * @param {string} moduleId - Module ID
   * @param {string} listenerId - Listener ID
   */
  untrackModuleListener(moduleId, listenerId) {
    const moduleSet = this.moduleListeners.get(moduleId);
    if (moduleSet) {
      moduleSet.delete(listenerId);
      if (moduleSet.size === 0) {
        this.moduleListeners.delete(moduleId);
      }
    }
  }
  
  /**
   * Track category listener relationship
   * @param {string} category - Category
   * @param {string} listenerId - Listener ID
   */
  trackCategoryListener(category, listenerId) {
    if (!this.categoryListeners.has(category)) {
      this.categoryListeners.set(category, new Set());
    }
    this.categoryListeners.get(category).add(listenerId);
  }
  
  /**
   * Remove category listener tracking
   * @param {string} category - Category
   * @param {string} listenerId - Listener ID
   */
  untrackCategoryListener(category, listenerId) {
    const categorySet = this.categoryListeners.get(category);
    if (categorySet) {
      categorySet.delete(listenerId);
      if (categorySet.size === 0) {
        this.categoryListeners.delete(category);
      }
    }
  }

  /**
   * Check for potential memory leaks
   * @param {Element} element - Target element
   * @param {string} moduleId - Module ID
   */
  checkForPotentialLeaks(element, moduleId) {
    // Check listeners per element
    const elementListeners = this.elementListeners.get(element);
    if (elementListeners && elementListeners.size >= this.options.maxListenersPerElement) {
      console.warn(`JustUI: Element has ${elementListeners.size} listeners, potential memory leak detected`);
      this.listenerStats.leaksDetected++;
    }
    
    // Check listeners per module
    const moduleListeners = this.moduleListeners.get(moduleId);
    if (moduleListeners && moduleListeners.size >= this.options.maxListenersPerModule) {
      console.warn(`JustUI: Module ${moduleId} has ${moduleListeners.size} listeners, potential memory leak detected`);
      this.listenerStats.leaksDetected++;
    }
    
    // Warn about approaching thresholds
    if (this.listenerStats.activeCount >= this.options.warnThreshold) {
      console.warn(`JustUI: Total active listeners (${this.listenerStats.activeCount}) approaching threshold`);
    }
  }
  
  /**
   * Normalize event listener options
   * @param {object|boolean} options - Options to normalize
   * @returns {object} Normalized options
   */
  normalizeOptions(options) {
    if (typeof options === 'boolean') {
      return { capture: options };
    }
    return { ...options };
  }
  
  /**
   * Generate unique listener ID
   * @returns {string} Unique ID
   */
  generateListenerId() {
    return `listener_${this.nextListenerId++}_${Date.now()}`;
  }
  
  /**
   * Start periodic cleanup of orphaned listeners
   */
  startPeriodicCleanup() {
    if (this.cleanupTimer) {
      return;
    }
    
    this.cleanupTimer = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.options.cleanupInterval);
    
    console.log('JustUI: Started EventListenerRegistry periodic cleanup');
  }
  
  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('JustUI: Stopped EventListenerRegistry periodic cleanup');
    }
  }
  
  /**
   * Perform periodic cleanup of dead listeners
   */
  performPeriodicCleanup() {
    if (!isExtensionContextValid()) {
      return;
    }
    
    const startTime = Date.now();
    let cleanedCount = 0;
    const toRemove = [];
    
    // Check for listeners on disconnected elements
    for (const [listenerId, listenerInfo] of this.listeners) {
      const { element } = listenerInfo;
      
      // Check if element is still connected to DOM
      if (element && element.nodeType === Node.ELEMENT_NODE && !element.isConnected) {
        toRemove.push(listenerId);
      }
    }
    
    // Remove disconnected listeners
    for (const listenerId of toRemove) {
      if (this.remove(listenerId)) {
        cleanedCount++;
      }
    }
    
    // Clean up orphaned listeners
    const orphanedCount = this.cleanupOrphanedListeners();
    cleanedCount += orphanedCount;
    
    if (cleanedCount > 0) {
      this.listenerStats.autoCleanups += cleanedCount;
      this.listenerStats.lastLeakCheck = Date.now();
      
      const duration = Date.now() - startTime;
      console.log(`JustUI: Periodic cleanup removed ${cleanedCount} listeners in ${duration}ms`);
    }
  }
  
  /**
   * Clean up orphaned listeners that failed to remove properly
   * @returns {number} Number of orphaned listeners cleaned
   */
  cleanupOrphanedListeners() {
    let cleanedCount = 0;
    
    for (const orphanedId of this.orphanedListeners) {
      // Try to remove again
      if (this.listeners.has(orphanedId)) {
        const listenerInfo = this.listeners.get(orphanedId);
        if (this.removeListenerInfo(listenerInfo)) {
          cleanedCount++;
        }
      }
      this.orphanedListeners.delete(orphanedId);
    }
    
    return cleanedCount;
  }
  
  /**
   * Get comprehensive statistics
   * @returns {object} Registry statistics
   */
  getStats() {
    const moduleStats = {};
    for (const [moduleId, listenerIds] of this.moduleListeners) {
      moduleStats[moduleId] = listenerIds.size;
    }
    
    const categoryStats = {};
    for (const [category, listenerIds] of this.categoryListeners) {
      categoryStats[category] = listenerIds.size;
    }
    
    return {
      ...this.listenerStats,
      currentActive: this.listeners.size,
      orphanedCount: this.orphanedListeners.size,
      moduleBreakdown: moduleStats,
      categoryBreakdown: categoryStats,
      memoryEstimate: this.estimateMemoryUsage(),
      healthScore: this.calculateHealthScore()
    };
  }
  
  /**
   * Estimate memory usage
   * @returns {object} Memory usage estimate
   */
  estimateMemoryUsage() {
    const listenerMemory = this.listeners.size * 300; // rough estimate per listener
    const trackingMemory = (this.moduleListeners.size + this.categoryListeners.size) * 100;
    const overhead = 1000;
    
    const totalBytes = listenerMemory + trackingMemory + overhead;
    
    return {
      listenerMemory,
      trackingMemory,
      overhead,
      totalBytes,
      totalKB: (totalBytes / 1024).toFixed(2)
    };
  }
  
  /**
   * Calculate registry health score (0-100)
   * @returns {number} Health score
   */
  calculateHealthScore() {
    let score = 100;
    
    // Penalize high listener counts
    const listenerRatio = this.listenerStats.activeCount / this.options.warnThreshold;
    if (listenerRatio > 1) {
      score -= Math.min(50, (listenerRatio - 1) * 50);
    }
    
    // Penalize orphaned listeners
    if (this.orphanedListeners.size > 0) {
      score -= Math.min(30, this.orphanedListeners.size * 5);
    }
    
    // Penalize detected leaks
    if (this.listenerStats.leaksDetected > 0) {
      score -= Math.min(20, this.listenerStats.leaksDetected * 5);
    }
    
    return Math.max(0, Math.round(score));
  }
  
  /**
   * Enhanced cleanup with statistics
   */
  cleanup() {
    console.log('JustUI: Starting EventListenerRegistry cleanup...');
    
    this.setLifecyclePhase(LIFECYCLE_PHASES.CLEANUP_PENDING);
    
    try {
      // Stop periodic cleanup
      this.stopPeriodicCleanup();
      
      // Get final stats before cleanup
      const finalStats = this.getStats();
      
      // Remove all listeners by priority
      const priorityOrder = [LISTENER_PRIORITIES.CRITICAL, LISTENER_PRIORITIES.HIGH, LISTENER_PRIORITIES.NORMAL, LISTENER_PRIORITIES.LOW];
      let totalRemoved = 0;
      
      for (const priority of priorityOrder) {
        const listenersToRemove = [];
        
        for (const [listenerId, listenerInfo] of this.listeners) {
          if (listenerInfo.metadata.priority === priority) {
            listenersToRemove.push(listenerId);
          }
        }
        
        for (const listenerId of listenersToRemove) {
          if (this.remove(listenerId)) {
            totalRemoved++;
          }
        }
      }
      
      // Clean up any remaining listeners
      const remainingIds = Array.from(this.listeners.keys());
      for (const listenerId of remainingIds) {
        if (this.remove(listenerId)) {
          totalRemoved++;
        }
      }
      
      // Clear all tracking structures
      this.listeners.clear();
      this.moduleListeners.clear();
      this.categoryListeners.clear();
      this.orphanedListeners.clear();
      
      // Reset statistics
      this.listenerStats = {
        totalRegistered: 0,
        totalRemoved: 0,
        activeCount: 0,
        leaksDetected: 0,
        autoCleanups: 0,
        lastLeakCheck: Date.now()
      };
      
      // Call parent cleanup
      super.cleanup();
      
      console.log('JustUI: EventListenerRegistry cleanup completed:', {
        totalRemoved,
        finalStats: {
          activeListeners: finalStats.currentActive,
          memoryUsage: finalStats.memoryEstimate.totalKB + 'KB',
          healthScore: finalStats.healthScore
        }
      });
      
    } catch (error) {
      console.error('JustUI: Error during EventListenerRegistry cleanup:', error);
      this.setLifecyclePhase(LIFECYCLE_PHASES.ERROR);
      throw error;
    }
  }
}

/**
 * Singleton instance for global use
 */
let globalRegistry = null;

/**
 * Get or create global event listener registry
 * @param {object} options - Registry options
 * @returns {EventListenerRegistry} Global registry instance
 */
export function getGlobalRegistry(options = {}) {
  if (!globalRegistry) {
    globalRegistry = new EventListenerRegistry(options);
  }
  return globalRegistry;
}

/**
 * Clean up global registry
 */
export function cleanupGlobalRegistry() {
  if (globalRegistry) {
    globalRegistry.cleanup();
    globalRegistry = null;
  }
}