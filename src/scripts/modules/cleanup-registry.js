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
   * @returns {Promise<Array>} Promise resolving to array of cleanup results
   */
  async cleanupAll() {
    // Sort by priority (high > normal > low)
    const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
    const moduleArray = Array.from(this.modules.entries())
      .sort((a, b) => {
        const aPriority = priorityOrder[a[1].priority] || 2;
        const bPriority = priorityOrder[b[1].priority] || 2;
        return bPriority - aPriority; // High priority first
      });

    // Create all cleanup promises with timeout protection (CRITICAL SAFETY FEATURE)
    const cleanupPromises = moduleArray.map(([name, { module }]) => {
      const startTime = Date.now();
      let timeoutId;

      try {
        const cleanupPromise = Promise.resolve(module.cleanup());
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Cleanup timeout')), 5000);
        });

        // Race cleanup against timeout - returns settled promise
        return Promise.race([cleanupPromise, timeoutPromise])
          .then(() => {
            clearTimeout(timeoutId); // FIX: Clear timer on success
            const duration = Date.now() - startTime;
            console.log(`OriginalUI: ✓ Cleaned up ${name} (${duration}ms)`);
            return { name, success: true, duration };
          })
          .catch((error) => {
            clearTimeout(timeoutId); // FIX: Clear timer on error
            const duration = Date.now() - startTime;
            console.warn(`OriginalUI: ✗ Error cleaning up ${name}:`, error);
            return { name, success: false, error: error.message, duration };
          });
      } catch (error) {
        // Synchronous errors - clear timer and return error result
        if (timeoutId) clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        console.warn(`OriginalUI: ✗ Synchronous error cleaning up ${name}:`, error);
        return Promise.resolve({ name, success: false, error: error.message, duration });
      }
    });

    // FIX: Use Promise.allSettled() to ensure ALL cleanups complete even if some fail
    const settledResults = await Promise.allSettled(cleanupPromises);

    // Extract results from settled promises
    const results = settledResults.map(result =>
      result.status === 'fulfilled' ? result.value : {
        name: 'unknown',
        success: false,
        error: result.reason?.message || 'Unknown error'
      }
    );

    // Clear all modules ONLY after all cleanups complete
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
   * @returns {Promise<Array>} Promise resolving to array of cleanup results
   */
  async cleanup() {
    console.log('OriginalUI: Starting CleanupRegistry cleanup...');
    const results = await this.cleanupAll();
    console.log('OriginalUI: CleanupRegistry cleanup completed');
    return results;
  }
}
