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
 * Registry for managing cleanable modules
 */
export class CleanupRegistry {
  constructor() {
    this.modules = new Set();
  }
  
  /**
   * Register a module for cleanup
   * @param {object} module - Module to register (must have cleanup method)
   * @param {string} name - Optional name for debugging
   */
  register(module, name = 'unnamed') {
    if (!isCleanable(module)) {
      console.warn(`JustUI: Module ${name} does not implement cleanup interface`);
      return false;
    }
    
    this.modules.add({ module, name });
    return true;
  }
  
  /**
   * Unregister a module
   * @param {object} module - Module to unregister
   */
  unregister(module) {
    for (const entry of this.modules) {
      if (entry.module === module) {
        this.modules.delete(entry);
        break;
      }
    }
  }
  
  /**
   * Clean up all registered modules
   */
  cleanupAll() {
    const results = [];
    
    for (const { module, name } of this.modules) {
      try {
        module.cleanup();
        results.push({ name, success: true });
        console.log(`JustUI: Successfully cleaned up ${name}`);
      } catch (error) {
        results.push({ name, success: false, error });
        console.warn(`JustUI: Error cleaning up ${name}:`, error);
      }
    }
    
    // Clear registry after cleanup
    this.modules.clear();
    
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
}