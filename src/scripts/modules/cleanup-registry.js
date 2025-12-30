/**
 * Simple Cleanup Interface and Registry
 * Provides basic cleanup coordination for modules
 */

/**
 * Check if object has cleanup method
 * @param {object} obj - Object to check
 * @returns {boolean} True if object has cleanup method
 */
export function isCleanable(obj) {
  return obj && typeof obj.cleanup === 'function';
}

/**
 * Simple cleanup registry for coordinating module cleanup
 * Provides timeout protection and priority-based ordering
 */
export class CleanupRegistry {
  constructor() {
    this.modules = new Map(); // name -> { module, priority }
    console.log('OriginalUI: CleanupRegistry initialized');
  }

  /**
   * Register a module for cleanup
   * @param {object} module - Module to register (must have cleanup method)
   * @param {string} name - Module name for debugging
   * @param {string} priority - Cleanup priority: 'high', 'normal', or 'low'
   * @returns {boolean} True if successfully registered
   */
  register(module, name = 'unnamed', priority = 'normal') {
    if (!isCleanable(module)) {
      console.warn(`OriginalUI: Module ${name} does not implement cleanup interface`);
      return false;
    }

    this.modules.set(name, { module, priority });
    console.log(`OriginalUI: Registered module ${name} for cleanup (priority: ${priority})`);
    return true;
  }

  /**
   * Unregister a module from cleanup
   * @param {string} name - Module name to unregister
   * @returns {boolean} True if successfully unregistered
   */
  unregister(name) {
    const wasRegistered = this.modules.has(name);
    if (wasRegistered) {
      this.modules.delete(name);
      console.log(`OriginalUI: Unregistered module ${name}`);
    }
    return wasRegistered;
  }

  /**
   * Clean up all registered modules with priority ordering and timeout protection
   * @returns {Array} Array of cleanup results
   */
  cleanupAll() {
    const results = [];

    // Sort by priority (high > normal > low)
    const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
    const moduleArray = Array.from(this.modules.entries())
      .sort((a, b) => {
        const aPriority = priorityOrder[a[1].priority] || 2;
        const bPriority = priorityOrder[b[1].priority] || 2;
        return bPriority - aPriority; // High priority first
      });

    // Process cleanup with timeout protection (CRITICAL SAFETY FEATURE)
    for (const [name, { module }] of moduleArray) {
      const startTime = Date.now();

      try {
        const cleanupPromise = Promise.resolve(module.cleanup());
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Cleanup timeout')), 5000);
        });

        Promise.race([cleanupPromise, timeoutPromise])
          .then(() => {
            const duration = Date.now() - startTime;
            console.log(`OriginalUI: ✓ Cleaned up ${name} (${duration}ms)`);
            results.push({ name, success: true, duration });
          })
          .catch((error) => {
            const duration = Date.now() - startTime;
            console.warn(`OriginalUI: ✗ Error cleaning up ${name}:`, error);
            results.push({ name, success: false, error: error.message, duration });
          });
      } catch (error) {
        const duration = Date.now() - startTime;
        console.warn(`OriginalUI: ✗ Synchronous error cleaning up ${name}:`, error);
        results.push({ name, success: false, error: error.message, duration });
      }
    }

    // Clear all modules after cleanup
    this.modules.clear();

    // Log summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`OriginalUI: Cleanup completed - ${successful} successful, ${failed} failed`);

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
    return Array.from(this.modules.keys());
  }

  /**
   * Clean up the registry itself
   * @returns {Array} Array of cleanup results
   */
  cleanup() {
    console.log('OriginalUI: Starting CleanupRegistry cleanup...');
    const results = this.cleanupAll();
    console.log('OriginalUI: CleanupRegistry cleanup completed');
    return results;
  }
}
