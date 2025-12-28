import { IParser } from './i-parser.js';

/**
 * Parses JSON format rules (for defaultBlockRequests)
 */
export class JsonRuleParser extends IParser {
  async parse(content) {
    // Content is already JSON (fetched with response.json())
    return Array.isArray(content) ? content : [];
  }
}
