/**
 * Unit Tests for EasyListDomParser
 * Tests parsing of EasyList cosmetic filter rules (##selector format)
 */

import { vi } from 'vitest';
import { EasyListDomParser } from '@modules/rule-execution/parsers/easylist-dom-parser.js';

describe('EasyListDomParser', () => {
  let parser;

  beforeEach(() => {
    parser = new EasyListDomParser();
    vi.clearAllMocks();
  });

  describe('Basic Parsing', () => {
    test('should parse class selector', async () => {
      const rawLines = ['##.ad-banner'];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('.ad-banner');
      expect(rules[0].domains).toEqual(['*']);
      expect(rules[0].enabled).toBe(true);
    });

    test('should parse ID selector', async () => {
      const rawLines = ['###AD_Top'];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('#AD_Top');
    });

    test('should parse attribute selector', async () => {
      const rawLines = ['##[class^="adDisplay-module"]'];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('[class^="adDisplay-module"]');
    });

    test('should parse complex selectors', async () => {
      const rawLines = ['##div.container > .ad-slot'];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('div.container > .ad-slot');
    });

    test('should parse multiple rules', async () => {
      const rawLines = [
        '##.ad',
        '###banner',
        '##[data-ad="true"]'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(3);
      expect(rules[0].selector).toBe('.ad');
      expect(rules[1].selector).toBe('#banner');
      expect(rules[2].selector).toBe('[data-ad="true"]');
    });
  });

  describe('Rule Object Structure', () => {
    test('should create rule with correct properties', async () => {
      const rawLines = ['##.ad'];

      const rules = await parser.parse(rawLines);

      expect(rules[0]).toMatchObject({
        id: expect.stringMatching(/^easylist-\d+$/),
        selector: '.ad',
        domains: ['*'],
        enabled: true,
        category: 'easylist',
        confidence: 'high',
        source: 'easylist_general_hide'
      });
    });

    test('should assign sequential IDs', async () => {
      const rawLines = ['##.ad1', '##.ad2', '##.ad3'];

      const rules = await parser.parse(rawLines);

      expect(rules[0].id).toBe('easylist-0');
      expect(rules[1].id).toBe('easylist-1');
      expect(rules[2].id).toBe('easylist-2');
    });

    test('should set all domains to wildcard', async () => {
      const rawLines = ['##.ad'];

      const rules = await parser.parse(rawLines);

      expect(rules[0].domains).toEqual(['*']);
    });
  });

  describe('Filtering - Comments', () => {
    test('should skip comment lines (starting with !)', async () => {
      const rawLines = [
        '! This is a comment',
        '##.ad',
        '! Another comment',
        '###banner'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(2);
      expect(rules[0].selector).toBe('.ad');
      expect(rules[1].selector).toBe('#banner');
    });
  });

  describe('Filtering - Empty Lines', () => {
    test('should skip empty lines', async () => {
      const rawLines = [
        '',
        '##.ad',
        '   ',
        '###banner',
        '\t'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(2);
    });
  });

  describe('Filtering - Section Headers', () => {
    test('should skip section headers (starting with [)', async () => {
      const rawLines = [
        '[Adblock Plus 2.0]',
        '##.ad',
        '[General hiding rules]',
        '###banner'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(2);
    });
  });

  describe('Filtering - Non-Cosmetic Rules', () => {
    test('should skip rules without ## prefix', async () => {
      const rawLines = [
        '||ads.example.com^',   // Network rule
        '##.ad',
        '/banner.js',           // Path rule
        '###banner'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(2);
      expect(rules[0].selector).toBe('.ad');
      expect(rules[1].selector).toBe('#banner');
    });

    test('should skip empty selector after ##', async () => {
      const rawLines = [
        '##',
        '##.ad'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('.ad');
    });
  });

  describe('Filtering - Procedural Selectors', () => {
    test('should skip :has-text() selectors', async () => {
      const rawLines = [
        '##.ad:has-text(Advertisement)',
        '##.valid-ad'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
      expect(rules[0].selector).toBe('.valid-ad');
    });

    test('should skip :contains() selectors', async () => {
      const rawLines = [
        '##div:contains(Sponsored)',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });

    test('should skip :xpath() selectors', async () => {
      const rawLines = [
        '##:xpath(//div[@class="ad"])',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });

    test('should skip :-abp- prefixed selectors', async () => {
      const rawLines = [
        '##.ad:-abp-has(.child)',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });

    test('should skip :upward() selectors', async () => {
      const rawLines = [
        '##.ad:upward(2)',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });

    test('should skip :remove() selectors', async () => {
      const rawLines = [
        '##.ad:remove()',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });

    test('should skip :style() selectors', async () => {
      const rawLines = [
        '##.ad:style(display: none !important)',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });

    test('should skip :matches-css() selectors', async () => {
      const rawLines = [
        '##.ad:matches-css(position: fixed)',
        '##.valid'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    test('should return empty array for null input', async () => {
      const rules = await parser.parse(null);

      expect(rules).toEqual([]);
    });

    test('should return empty array for undefined input', async () => {
      const rules = await parser.parse(undefined);

      expect(rules).toEqual([]);
    });

    test('should return empty array for empty input', async () => {
      const rules = await parser.parse([]);

      expect(rules).toEqual([]);
    });

    test('should return empty array for non-array input', async () => {
      const rules = await parser.parse('##.ad');

      expect(rules).toEqual([]);
    });

    test('should handle mixed valid and invalid rules', async () => {
      const rawLines = [
        '! Comment',
        '',
        '##.valid1',
        '##:has-text(skip)',
        '##.valid2',
        '[Section]',
        '||network.com^',
        '##.valid3'
      ];

      const rules = await parser.parse(rawLines);

      expect(rules).toHaveLength(3);
      expect(rules[0].selector).toBe('.valid1');
      expect(rules[1].selector).toBe('.valid2');
      expect(rules[2].selector).toBe('.valid3');
    });
  });

  describe('getStatistics()', () => {
    test('should count rules by type', () => {
      const rules = [
        { selector: '.class-selector' },
        { selector: '#id-selector' },
        { selector: '[data-attr]' },
        { selector: 'div' },
        { selector: 'div > .child' },  // Starts with tag, so counted as tag
        { selector: '*' }               // Wildcard, counted as complex
      ];

      const stats = parser.getStatistics(rules);

      expect(stats.total).toBe(6);
      expect(stats.byType.class).toBe(1);
      expect(stats.byType.id).toBe(1);
      expect(stats.byType.attribute).toBe(1);
      expect(stats.byType.tag).toBe(2);      // 'div' and 'div > .child'
      expect(stats.byType.complex).toBe(1);  // '*' wildcard
    });

    test('should handle empty rules array', () => {
      const stats = parser.getStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.byType.class).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should handle large rule sets efficiently', async () => {
      const rawLines = Array.from({ length: 10000 }, (_, i) => `##.ad-${i}`);

      const start = Date.now();
      const rules = await parser.parse(rawLines);
      const duration = Date.now() - start;

      expect(rules).toHaveLength(10000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
