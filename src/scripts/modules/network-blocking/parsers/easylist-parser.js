import { IParser } from './i-parser.js';

/**
 * Parses EasyList text format into rule objects
 */
export class EasyListParser extends IParser {
  async parse(content) {
    return content
      .split('\n')
      .filter(line => {
        // Filter network blocking rules
        const trimmed = line.trim();
        return (
          trimmed.length > 0 &&
          !trimmed.startsWith('!') && // Skip comments
          (trimmed.startsWith('||') || trimmed.includes('$')) // Network filters
        );
      })
      .map(line => line.trim());
  }
}
