/**
 * Abstract interface for rule sources (DIP)
 * All rule sources must implement this interface
 */
export class IRuleSource {
  /**
   * Fetch raw rule data from source
   * @returns {Promise<string>} Raw rule content
   */
  async fetchRules() {
    throw new Error('IRuleSource.fetchRules() must be implemented');
  }

  /**
   * Get rule ID allocation range
   * @returns {{ start: number, end: number }}
   */
  getRuleIdRange() {
    throw new Error('IRuleSource.getRuleIdRange() must be implemented');
  }

  /**
   * Get update interval in minutes
   * @returns {number}
   */
  getUpdateInterval() {
    throw new Error('IRuleSource.getUpdateInterval() must be implemented');
  }

  /**
   * Get human-readable source name
   * @returns {string}
   */
  getName() {
    throw new Error('IRuleSource.getName() must be implemented');
  }

  /**
   * Get update type (dynamic or static)
   * @returns {'dynamic' | 'static'}
   */
  getUpdateType() {
    throw new Error('IRuleSource.getUpdateType() must be implemented');
  }
}
