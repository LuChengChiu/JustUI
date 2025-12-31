/**
 * Unit Tests for SelectorParser
 * Tests CSS selector validation and rule filtering
 */

import { vi } from 'vitest';
import { SelectorParser } from '@modules/rule-execution/parsers/selector-parser.js';

describe('SelectorParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SelectorParser();

    // Mock document.querySelectorAll for validation
    global.document = {
      querySelectorAll: vi.fn()
    };
  });

  afterEach(() => {
    delete global.document;
  });

  describe('Basic Parsing', () => {
    test('should pass through enabled rules with valid selectors', async () => {
      const rules = [
        { id: '1', selector: '.ad', enabled: true, domains: ['*'] },
        { id: '2', selector: '#banner', enabled: true, domains: ['example.com'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed).toEqual(rules);
      expect(parsed.length).toBe(2);
    });

    test('should preserve rule metadata', async () => {
      const rules = [
        {
          id: '1',
          selector: '.ad',
          enabled: true,
          domains: ['*'],
          description: 'Remove ads',
          category: 'advertising',
          confidence: 'high'
        }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed[0]).toEqual(rules[0]);
      expect(parsed[0].description).toBe('Remove ads');
      expect(parsed[0].category).toBe('advertising');
    });
  });

  describe('Rule Filtering - Disabled Rules', () => {
    test('should filter out disabled rules (enabled: false)', async () => {
      const rules = [
        { id: '1', selector: '.ad', enabled: true, domains: ['*'] },
        { id: '2', selector: '#banner', enabled: false, domains: ['*'] },
        { id: '3', selector: '.tracking', enabled: true, domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(2);
      expect(parsed.find(r => r.id === '2')).toBeUndefined();
    });

    test('should treat missing enabled property as enabled', async () => {
      const rules = [
        { id: '1', selector: '.ad', domains: ['*'] } // No enabled property
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(1);
    });
  });

  describe('Rule Filtering - Empty Selectors', () => {
    test('should reject rules with empty selectors', async () => {
      const rules = [
        { id: '1', selector: '', enabled: true, domains: ['*'] },
        { id: '2', selector: '.valid', enabled: true, domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('2');
    });

    test('should reject rules with null selectors', async () => {
      const rules = [
        { id: '1', selector: null, enabled: true, domains: ['*'] },
        { id: '2', selector: '.valid', enabled: true, domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('2');
    });

    test('should reject rules with undefined selectors', async () => {
      const rules = [
        { id: '1', enabled: true, domains: ['*'] }, // No selector property
        { id: '2', selector: '.valid', enabled: true, domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('2');
    });

    test('should reject rules with whitespace-only selectors', async () => {
      const rules = [
        { id: '1', selector: '   ', enabled: true, domains: ['*'] },
        { id: '2', selector: '\t\n', enabled: true, domains: ['*'] },
        { id: '3', selector: '.valid', enabled: true, domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe('3');
    });
  });

  describe('CSS Selector Validation', () => {
    test('should accept all enabled rules with non-empty selectors', async () => {
      const rules = [
        { id: '1', selector: '.class', enabled: true, domains: ['*'] },
        { id: '2', selector: '#id', enabled: true, domains: ['*'] },
        { id: '3', selector: 'div.class', enabled: true, domains: ['*'] },
        { id: '4', selector: '[data-ad]', enabled: true, domains: ['*'] },
        { id: '5', selector: 'div > .child', enabled: true, domains: ['*'] }
      ];

      const parsed = await parser.parse(rules);

      // Parser doesn't validate CSS syntax, just checks for non-empty strings
      expect(parsed.length).toBe(5);
    });

    test('validateSelector method should reject invalid CSS syntax', () => {
      // Mock querySelectorAll to throw on invalid selector
      document.querySelectorAll.mockImplementation((selector) => {
        if (selector === ':::invalid') {
          throw new Error('Invalid selector');
        }
        return [];
      });

      expect(parser.validateSelector('.valid')).toBe(true);
      expect(parser.validateSelector(':::invalid')).toBe(false);
    });

    test('validateSelector method should handle errors gracefully', () => {
      document.querySelectorAll.mockImplementation((selector) => {
        if (selector === '[broken') {
          throw new DOMException('Invalid selector', 'SyntaxError');
        }
        return [];
      });

      expect(parser.validateSelector('.valid')).toBe(true);
      expect(parser.validateSelector('[broken')).toBe(false);
    });

    test('parse() does not validate CSS syntax (validation happens at execution)', async () => {
      const rules = [
        { id: '1', selector: '.valid', enabled: true, domains: ['*'] },
        { id: '2', selector: ':::invalid', enabled: true, domains: ['*'] },
        { id: '3', selector: '[broken', enabled: true, domains: ['*'] }
      ];

      const parsed = await parser.parse(rules);

      // Parser accepts all rules with non-empty selectors
      // Validation happens later in executor
      expect(parsed.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    test('should return empty array for empty input', async () => {
      const parsed = await parser.parse([]);
      expect(parsed).toEqual([]);
    });

    test('should return empty array for null input', async () => {
      const parsed = await parser.parse(null);
      expect(parsed).toEqual([]);
    });

    test('should return empty array for undefined input', async () => {
      const parsed = await parser.parse(undefined);
      expect(parsed).toEqual([]);
    });

    test('should return empty array when all rules are invalid', async () => {
      const rules = [
        { id: '1', selector: '', enabled: true, domains: ['*'] },
        { id: '2', selector: null, enabled: true, domains: ['*'] },
        { id: '3', enabled: false, selector: '.ad', domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed).toEqual([]);
    });

    test('should handle mixed valid and invalid rules', async () => {
      const rules = [
        { id: '1', selector: '.valid1', enabled: true, domains: ['*'] },
        { id: '2', selector: '', enabled: true, domains: ['*'] },
        { id: '3', selector: '.valid2', enabled: false, domains: ['*'] },
        { id: '4', selector: '.valid3', enabled: true, domains: ['*'] },
        { id: '5', selector: null, enabled: true, domains: ['*'] }
      ];

      document.querySelectorAll.mockReturnValue([]);

      const parsed = await parser.parse(rules);

      expect(parsed.length).toBe(2);
      expect(parsed[0].id).toBe('1');
      expect(parsed[1].id).toBe('4');
    });
  });

  describe('Performance', () => {
    test('should handle large rule sets efficiently', async () => {
      const rules = Array.from({ length: 1000 }, (_, i) => ({
        id: `rule-${i}`,
        selector: `.ad-${i}`,
        enabled: true,
        domains: ['*']
      }));

      document.querySelectorAll.mockReturnValue([]);

      const start = Date.now();
      const parsed = await parser.parse(rules);
      const duration = Date.now() - start;

      expect(parsed.length).toBe(1000);
      expect(duration).toBeLessThan(100); // Should complete quickly
    });
  });
});
