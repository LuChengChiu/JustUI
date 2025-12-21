/**
 * Cleanable Interface Contract
 * Defines the contract for modules that require cleanup to prevent memory leaks
 */

/**
 * Check if an object implements the Cleanable interface
 * @param {object} obj - Object to check
 * @returns {boolean} True if object has cleanup method
 */
export function isCleanable(obj) {
  return obj && typeof obj.cleanup === 'function';
}

/**
 * Base class for cleanable modules (optional - can use duck typing instead)
 */
export class CleanableModule {
  /**
   * Clean up all resources, event listeners, observers, etc.
   * Must be implemented by subclasses
   */
  cleanup() {
    throw new Error('cleanup() method must be implemented by subclass');
  }
  
  /**
   * Check if this module is cleanable
   * @returns {boolean} Always true for CleanableModule instances
   */
  isCleanable() {
    return true;
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
   * Register a module for cleanup with compartmentalization
   * @param {object} module - Module to register (must have cleanup method)
   * @param {string} name - Optional name for debugging
   * @param {string} compartment - Compartment category (e.g., 'protection', 'analysis', 'tracking')
   */
  register(module, name = 'unnamed', compartment = 'default') {
    if (!isCleanable(module)) {
      console.warn(`JustUI: Module ${name} does not implement cleanup interface`);
      return false;
    }
    
    // Create compartment if it doesn't exist
    if (!this.compartments.has(compartment)) {
      this.compartments.set(compartment, {
        modules: new Set(),
        createdAt: Date.now(),
        lastAccessed: Date.now()
      });
    }
    
    const compartmentData = this.compartments.get(compartment);
    const moduleEntry = { module, name, compartment, registeredAt: Date.now() };
    
    // Add to main registry and compartment
    this.modules.add(moduleEntry);
    compartmentData.modules.add(moduleEntry);
    compartmentData.lastAccessed = Date.now();
    
    // Track registration time for TTL management
    this.registrationTimes.set(module, Date.now());
    
    // Check compartment size limits
    this.enforceCompartmentLimits(compartment);
    
    console.log(`JustUI: Registered module ${name} in compartment ${compartment}`);
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
   * Clean up all registered modules
   */
  cleanupAll() {
    const results = [];
    
    for (const { module, name, compartment } of this.modules) {
      try {
        module.cleanup();
        results.push({ name, compartment, success: true });
        console.log(`JustUI: Successfully cleaned up ${name} from ${compartment}`);
      } catch (error) {
        results.push({ name, compartment, success: false, error });
        console.warn(`JustUI: Error cleaning up ${name}:`, error);
      }
    }
    
    // Clear all storage
    this.modules.clear();
    this.compartments.clear();
    this.cleanupHistory.push({
      timestamp: Date.now(),
      action: 'cleanupAll',
      results
    });
    
    // Stop periodic cleanup
    this.stopPeriodicCleanup();
    
    return results;
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
   * Get memory usage statistics
   * @returns {object} Memory and compartment statistics
   */
  getMemoryStats() {
    const compartmentStats = {};
    
    for (const [name, data] of this.compartments) {
      compartmentStats[name] = {
        moduleCount: data.modules.size,
        age: Date.now() - data.createdAt,
        lastAccessed: Date.now() - data.lastAccessed,
        isExpired: (Date.now() - data.lastAccessed) > this.options.compartmentTTL
      };
    }

    return {
      totalModules: this.modules.size,
      totalCompartments: this.compartments.size,
      compartments: compartmentStats,
      cleanupHistory: this.cleanupHistory.slice(-10), // Last 10 cleanup events
      options: this.options
    };
  }

  /**
   * Cleanup method for the registry itself
   */
  cleanup() {
    // Cleanup all modules first
    this.cleanupAll();
    
    // Clear cleanup history
    this.cleanupHistory = [];
    
    console.log('JustUI: CleanupRegistry cleaned up');
  }
}