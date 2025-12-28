/**
 * Parser interface (ISP - segregated interfaces)
 */
export class IParser {
  /**
   * Parse raw content into rule array
   * @param {string} content - Raw content to parse
   * @returns {Promise<Array>} Parsed rules
   */
  async parse(content) {
    throw new Error('IParser.parse() must be implemented');
  }
}
