/**
 * Unit Tests for Network Blocking Parsers
 * Tests EasyListParser and JsonRuleParser
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { EasyListParser } from '@modules/network-blocking/parsers/easylist-parser.js';
import { JsonRuleParser } from '@modules/network-blocking/parsers/json-rule-parser.js';

describe('EasyListParser', () => {
  let parser;

  beforeEach(() => {
    parser = new EasyListParser();
  });

  describe('parse()', () => {
    test('should parse valid network filters', async () => {
      const content = `
! Comment line
||example.com^
||ads.tracker.com^$script,third-party
/banner/*$image
      `.trim();

      const result = await parser.parse(content);

      expect(result).toHaveLength(3);
      expect(result).toContain('||example.com^');
      expect(result).toContain('||ads.tracker.com^$script,third-party');
      expect(result).toContain('/banner/*$image');
    });

    test('should filter out comment lines', async () => {
      const content = `
! This is a comment
! Another comment
||valid-rule.com^
! More comments
||another-rule.com^
      `.trim();

      const result = await parser.parse(content);

      expect(result).toHaveLength(2);
      expect(result.every(line => !line.startsWith('!'))).toBe(true);
    });

    test('should filter out empty lines', async () => {
      const content = `
||rule1.com^


||rule2.com^

      `.trim();

      const result = await parser.parse(content);

      expect(result).toHaveLength(2);
      expect(result.every(line => line.length > 0)).toBe(true);
    });

    test('should pass all non-comment rules to converter', async () => {
      const content = `
||network-rule.com^
##.cosmetic-filter
||another-network.com^$script
###ad-container
/path/*$third-party
example.com##selector
      `.trim();

      const result = await parser.parse(content);

      // Should pass all non-comment lines to converter (let @eyeo/abp2dnr handle validation)
      expect(result).toHaveLength(6);
      expect(result).toContain('||network-rule.com^');
      expect(result).toContain('##.cosmetic-filter');
      expect(result).toContain('||another-network.com^$script');
      expect(result).toContain('###ad-container');
      expect(result).toContain('/path/*$third-party');
      expect(result).toContain('example.com##selector');
    });

    test('should trim whitespace from rules', async () => {
      const content = `
  ||example.com^
    ||test.com^$script
||another.com^
      `.trim();

      const result = await parser.parse(content);

      expect(result).toHaveLength(3);
      expect(result.every(line => line === line.trim())).toBe(true);
    });

    test('should handle empty content', async () => {
      const result = await parser.parse('');

      expect(result).toEqual([]);
    });

    test('should handle content with only comments', async () => {
      const content = `
! Comment 1
! Comment 2
! Comment 3
      `.trim();

      const result = await parser.parse(content);

      expect(result).toEqual([]);
    });

    test('should handle complex EasyList syntax', async () => {
      const content = `
[Adblock Plus 2.0]
! Title: EasyList
! Version: 202312281200
||doubleclick.net^
||google-analytics.com^$third-party
||ads.example.com^$script,image
/banner/*/ad.js$~third-party
@@||exception.com^$elemhide
      `.trim();

      const result = await parser.parse(content);

      // Should include only valid network rules
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.includes('doubleclick.net'))).toBe(true);
      expect(result.some(r => r.includes('google-analytics.com'))).toBe(true);
    });

    test('should preserve rule options', async () => {
      const content = '||tracker.com^$script,third-party,domain=example.com';

      const result = await parser.parse(content);

      expect(result[0]).toBe('||tracker.com^$script,third-party,domain=example.com');
    });

    test('should handle mixed line endings', async () => {
      const content = '||rule1.com^\r\n||rule2.com^\n||rule3.com^\r';

      const result = await parser.parse(content);

      expect(result).toHaveLength(3);
    });
  });

  describe('IParser interface compliance', () => {
    test('should have parse method', () => {
      expect(typeof parser.parse).toBe('function');
    });

    test('should return a Promise', () => {
      const result = parser.parse('||test.com^');
      expect(result).toBeInstanceOf(Promise);
    });

    test('should return an array', async () => {
      const result = await parser.parse('||test.com^');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('JsonRuleParser', () => {
  let parser;

  beforeEach(() => {
    parser = new JsonRuleParser();
  });

  describe('parse()', () => {
    test('should parse valid JSON array', async () => {
      const content = [
        { id: 'rule1', trigger: 'example.com' },
        { id: 'rule2', trigger: 'test.com' }
      ];

      const result = await parser.parse(content);

      expect(result).toEqual(content);
      expect(result).toHaveLength(2);
    });

    test('should return empty array for non-array input', async () => {
      const content = { id: 'rule1', trigger: 'example.com' };

      const result = await parser.parse(content);

      expect(result).toEqual([]);
    });

    test('should handle empty array', async () => {
      const result = await parser.parse([]);

      expect(result).toEqual([]);
    });

    test('should handle null input', async () => {
      const result = await parser.parse(null);

      expect(result).toEqual([]);
    });

    test('should handle undefined input', async () => {
      const result = await parser.parse(undefined);

      expect(result).toEqual([]);
    });

    test('should preserve rule object structure', async () => {
      const content = [
        {
          id: 'uBO_001',
          trigger: 'doubleclick.net',
          category: 'tracking',
          severity: 'high',
          description: 'Google tracking domain',
          resourceTypes: ['xmlhttprequest', 'script']
        }
      ];

      const result = await parser.parse(content);

      expect(result[0]).toMatchObject(content[0]);
      expect(result[0].id).toBe('uBO_001');
      expect(result[0].resourceTypes).toEqual(['xmlhttprequest', 'script']);
    });

    test('should handle complex rule objects', async () => {
      const content = [
        {
          id: 'uBO_002',
          trigger: '.*\\.malware\\.com',
          isRegex: true,
          severity: 'critical',
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'],
          metadata: {
            source: 'user-custom',
            created: '2025-12-28'
          }
        }
      ];

      const result = await parser.parse(content);

      expect(result[0].isRegex).toBe(true);
      expect(result[0].metadata).toBeDefined();
      expect(result[0].metadata.source).toBe('user-custom');
    });
  });

  describe('IParser interface compliance', () => {
    test('should have parse method', () => {
      expect(typeof parser.parse).toBe('function');
    });

    test('should return a Promise', () => {
      const result = parser.parse([]);
      expect(result).toBeInstanceOf(Promise);
    });

    test('should return an array', async () => {
      const result = await parser.parse([{ id: '1', trigger: 'test.com' }]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('should handle array with mixed valid and invalid items', async () => {
      const content = [
        { id: 'valid1', trigger: 'test.com' },
        'invalid-string',
        { id: 'valid2', trigger: 'example.com' },
        null,
        { id: 'valid3', trigger: 'tracker.io' }
      ];

      const result = await parser.parse(content);

      // Should preserve all items in array (no filtering in parser)
      expect(result).toEqual(content);
    });

    test('should handle already-parsed JSON (array of objects)', async () => {
      const content = [
        { id: 'rule1', trigger: 'ad.com' },
        { id: 'rule2', trigger: 'tracker.net' }
      ];

      const result = await parser.parse(content);

      expect(result).toBe(content); // Should return same reference
    });
  });
});
