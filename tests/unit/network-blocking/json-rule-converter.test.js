/**
 * Unit Tests for JsonRuleConverter
 * Tests browser-compatible JSON rule conversion to DNR format
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { JsonRuleConverter } from '@modules/network-blocking/core/json-rule-converter.js';

describe('JsonRuleConverter', () => {
  let converter;
  const mockIdRange = { start: 50000, end: 50999 };

  beforeEach(() => {
    converter = new JsonRuleConverter();
    vi.clearAllMocks();
  });

  describe('convert()', () => {
    test('should convert valid JSON rule to DNR format', async () => {
      const jsonRule = {
        id: 'uBO_001',
        trigger: 'doubleclick.net',
        severity: 'high',
        resourceTypes: ['xmlhttprequest']
      };

      const result = await converter.convert([jsonRule], mockIdRange);

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        id: 50000,
        priority: 2, // high severity
        action: { type: 'block' },
        condition: {
          urlFilter: '*://*doubleclick.net/*',
          resourceTypes: ['xmlhttprequest']
        }
      });
    });

    test('should handle multiple JSON rules', async () => {
      const rules = [
        { id: 'uBO_001', trigger: 'tracker1.com', severity: 'high' },
        { id: 'uBO_002', trigger: 'tracker2.com', severity: 'medium' },
        { id: 'uBO_003', trigger: 'tracker3.com', severity: 'low' }
      ];

      const result = await converter.convert(rules, mockIdRange);

      expect(result.length).toBe(3);
      // Verify IDs are assigned sequentially
      expect(result[0].id).toBe(50000);
      expect(result[1].id).toBe(50001);
      expect(result[2].id).toBe(50002);
      // Verify priorities based on severity
      expect(result[0].priority).toBe(2); // high
      expect(result[1].priority).toBe(1); // medium
      expect(result[2].priority).toBe(1); // low
    });

    test('should handle regex patterns in JSON rules', async () => {
      const jsonRule = {
        id: 'uBO_002',
        trigger: '.*\\.evil-cdn\\.com',
        severity: 'critical',
        isRegex: true,
        resourceTypes: ['script']
      };

      const result = await converter.convert([jsonRule], mockIdRange);

      expect(result[0].condition).toMatchObject({
        regexFilter: '.*\\.evil-cdn\\.com',
        resourceTypes: ['script']
      });
      expect(result[0].condition.urlFilter).toBeUndefined();
    });

    test('should apply correct priority based on severity', async () => {
      const rules = [
        { trigger: 'low.com', severity: 'low' },
        { trigger: 'medium.com', severity: 'medium' },
        { trigger: 'high.com', severity: 'high' },
        { trigger: 'critical.com', severity: 'critical' }
      ];

      const result = await converter.convert(rules, mockIdRange);

      expect(result[0].priority).toBe(1); // low -> priority 1
      expect(result[1].priority).toBe(1); // medium -> priority 1
      expect(result[2].priority).toBe(2); // high -> priority 2
      expect(result[3].priority).toBe(3); // critical -> priority 3
    });

    test('should use default resource types if not specified', async () => {
      const jsonRule = {
        id: 'uBO_003',
        trigger: 'tracking.io',
        severity: 'medium'
      };

      const result = await converter.convert([jsonRule], mockIdRange);

      expect(result[0].condition.resourceTypes).toEqual([
        'xmlhttprequest',
        'script',
        'sub_frame'
      ]);
    });

    test('should preserve custom resource types', async () => {
      const jsonRule = {
        trigger: 'custom.com',
        severity: 'low',
        resourceTypes: ['image', 'media', 'font']
      };

      const result = await converter.convert([jsonRule], mockIdRange);

      expect(result[0].condition.resourceTypes).toEqual(['image', 'media', 'font']);
    });

    test('should skip invalid rule objects', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rules = [
        { trigger: 'valid.com', severity: 'high' },
        null, // Invalid
        'invalid-string', // Invalid
        { trigger: 'another-valid.com', severity: 'low' }
      ];

      const result = await converter.convert(rules, mockIdRange);

      expect(result.length).toBe(2);
      expect(result[0].id).toBe(50000);
      expect(result[1].id).toBe(50001);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

      consoleWarnSpy.mockRestore();
    });

    test('should handle empty rules array', async () => {
      const result = await converter.convert([], mockIdRange);

      expect(result).toEqual([]);
    });

    test('should stop when ID range is exceeded', async () => {
      const limitedRange = { start: 50000, end: 50002 };
      const rules = [
        { trigger: 'test1.com', severity: 'high' },
        { trigger: 'test2.com', severity: 'high' },
        { trigger: 'test3.com', severity: 'high' },
        { trigger: 'test4.com', severity: 'high' }
      ];

      const result = await converter.convert(rules, limitedRange);

      // Should stop after exceeding range (range allows IDs 50000-50002 = 3 rules)
      expect(result.length).toBe(3);
      expect(result[0].id).toBe(50000);
      expect(result[1].id).toBe(50001);
      expect(result[2].id).toBe(50002);
    });

    test('should track conversion statistics', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const rules = [
        { trigger: 'valid.com', severity: 'high' },
        null, // Failed
        { trigger: 'another.com', severity: 'low' }
      ];

      await converter.convert(rules, mockIdRange);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('JSON conversion stats:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('2/3 converted, 1 failed')
      );

      consoleLogSpy.mockRestore();
    });

    test('should handle conversion errors gracefully', async () => {
      const rules = [
        { trigger: 'valid.com', severity: 'high' },
        { /* missing required fields - still converts with defaults */ },
        { trigger: 'another.com', severity: 'low' }
      ];

      const result = await converter.convert(rules, mockIdRange);

      // Should continue processing all rules (even malformed ones convert with defaults)
      expect(result.length).toBe(3);
      expect(result[0].id).toBe(50000);
      expect(result[2].id).toBe(50002);
    });
  });

  describe('convertJsonRule()', () => {
    test('should convert basic JSON rule', () => {
      const jsonRule = {
        trigger: 'example.com',
        severity: 'medium'
      };

      const result = converter.convertJsonRule(jsonRule, 50000);

      expect(result).toMatchObject({
        id: 50000,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*://*example.com/*'
        }
      });
    });

    test('should handle regex JSON rules', () => {
      const jsonRule = {
        trigger: '^https?://.*\\.tracker\\.com',
        severity: 'high',
        isRegex: true
      };

      const result = converter.convertJsonRule(jsonRule, 50001);

      expect(result.condition).toMatchObject({
        regexFilter: '^https?://.*\\.tracker\\.com'
      });
      expect(result.condition.urlFilter).toBeUndefined();
    });

    test('should preserve custom resource types', () => {
      const jsonRule = {
        trigger: 'custom.com',
        severity: 'low',
        resourceTypes: ['image', 'media', 'font']
      };

      const result = converter.convertJsonRule(jsonRule, 50002);

      expect(result.condition.resourceTypes).toEqual(['image', 'media', 'font']);
    });

    test('should handle critical severity', () => {
      const jsonRule = {
        trigger: 'malware.com',
        severity: 'critical'
      };

      const result = converter.convertJsonRule(jsonRule, 50003);

      expect(result.priority).toBe(3);
    });

    test('should handle high severity', () => {
      const jsonRule = {
        trigger: 'tracking.com',
        severity: 'high'
      };

      const result = converter.convertJsonRule(jsonRule, 50004);

      expect(result.priority).toBe(2);
    });

    test('should handle medium and low severity as priority 1', () => {
      const mediumRule = {
        trigger: 'medium.com',
        severity: 'medium'
      };

      const lowRule = {
        trigger: 'low.com',
        severity: 'low'
      };

      const mediumResult = converter.convertJsonRule(mediumRule, 50005);
      const lowResult = converter.convertJsonRule(lowRule, 50006);

      expect(mediumResult.priority).toBe(1);
      expect(lowResult.priority).toBe(1);
    });

    test('should use default resource types when not specified', () => {
      const jsonRule = {
        trigger: 'test.com',
        severity: 'high'
      };

      const result = converter.convertJsonRule(jsonRule, 50007);

      expect(result.condition.resourceTypes).toEqual([
        'xmlhttprequest',
        'script',
        'sub_frame'
      ]);
    });

    test('should create proper DNR structure', () => {
      const jsonRule = {
        trigger: 'test.com',
        severity: 'high',
        resourceTypes: ['script']
      };

      const result = converter.convertJsonRule(jsonRule, 50008);

      // Verify complete DNR structure
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('priority');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('condition');
      expect(result.action).toEqual({ type: 'block' });
      expect(typeof result.id).toBe('number');
      expect(typeof result.priority).toBe('number');
    });
  });

  describe('Edge cases', () => {
    test('should handle rules with undefined severity', async () => {
      const jsonRule = {
        trigger: 'test.com'
        // No severity specified
      };

      const result = await converter.convert([jsonRule], mockIdRange);

      // Should default to priority 1 (medium/low)
      expect(result[0].priority).toBe(1);
    });

    test('should handle malformed rule objects', async () => {
      const rules = [
        { /* completely empty */ },
        { trigger: null },
        { trigger: undefined },
        { trigger: 'valid.com', severity: 'high' }
      ];

      const result = await converter.convert(rules, mockIdRange);

      // All rules convert (even with null/undefined triggers - graceful handling)
      expect(result.length).toBe(4);
      // Last rule should be the valid one
      expect(result[3].condition.urlFilter).toContain('valid.com');
    });

    test('should handle large number of rules', async () => {
      const rules = Array(100).fill(null).map((_, i) => ({
        trigger: `domain${i}.com`,
        severity: 'medium'
      }));

      const result = await converter.convert(rules, { start: 50000, end: 50999 });

      expect(result.length).toBe(100);
      expect(result[0].id).toBe(50000);
      expect(result[99].id).toBe(50099);
    });

    test('should return Promise', () => {
      const result = converter.convert([], mockIdRange);
      expect(result).toBeInstanceOf(Promise);
    });

    test('should return array from convert', async () => {
      const result = await converter.convert([{ trigger: 'test.com' }], mockIdRange);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
