/**
 * Update strategy interface (DIP)
 */
export class IUpdater {
  /**
   * Update rules in Chrome's declarativeNetRequest
   * @param {Array} rules - DNR rules to update
   * @param {{ start: number, end: number }} idRange - Rule ID range
   * @returns {Promise<void>}
   */
  async update(rules, idRange) {
    throw new Error('IUpdater.update() must be implemented');
  }
}
