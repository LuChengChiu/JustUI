/**
 * Unit Tests for RuleConverter
 * Tests conversion of EasyList filters and JSON rules to DNR format
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { RuleConverter } from '@modules/network-blocking/core/rule-converter.js';

// Mock @eyeo/abp2dnr
vi.mock('@eyeo/abp2dnr', () => ({
  convertFilter: vi.fn()
}));

import { convertFilter } from '@eyeo/abp2dnr';

describe('RuleConverter', () => {
  let converter;
  const mockIdRange = { start: 1000, end: 2000 };

  beforeEach(() => {
    converter = new RuleConverter();
    vi.clearAllMocks();
  });

  describe('convert() - EasyList format', () => {
    test('should convert valid EasyList filter to DNR rules', async () => {
      // @eyeo/abp2dnr returns rules WITHOUT IDs - IDs are assigned manually
      const mockDNRRuleWithoutId = {
        priority: 1,
        action: { type: 'block' },
        condition: { urlFilter: '*://example.com/*' }
      };

      convertFilter.mockResolvedValue([mockDNRRuleWithoutId]);

      const rules = ['||example.com^'];
      const result = await converter.convert(rules, mockIdRange);

      // convertFilter should be called without ruleId option (not supported by @eyeo/abp2dnr)
      expect(convertFilter).toHaveBeenCalledWith('||example.com^');
      // Result should have ID assigned manually by RuleConverter
      expect(result).toEqual([{ ...mockDNRRuleWithoutId, id: 1000 }]);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1000);
    });

    test('should handle multiple EasyList filters', async () => {
      // Mock returns rules without IDs (actual @eyeo/abp2dnr behavior)
      convertFilter
        .mockResolvedValueOnce([{ priority: 1 }])
        .mockResolvedValueOnce([{ priority: 1 }]);

      const rules = ['||example.com^', '||test.com^'];
      const result = await converter.convert(rules, mockIdRange);

      expect(convertFilter).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(2);
      // Verify IDs were assigned sequentially
      expect(result[0].id).toBe(1000);
      expect(result[1].id).toBe(1001);
    });

    test('should skip invalid filters and continue processing', async () => {
      convertFilter
        .mockResolvedValueOnce([{ priority: 1 }])
        .mockRejectedValueOnce(new Error('filter_invalid_regexp'))
        .mockResolvedValueOnce([{ priority: 1 }]);

      const rules = ['||valid.com^', '/(invalid)regex/', '||another.com^'];
      const result = await converter.convert(rules, mockIdRange);

      expect(result.length).toBe(2);
      // IDs should be assigned sequentially (skipping the failed one)
      expect(result[0].id).toBe(1000);
      expect(result[1].id).toBe(1001);
    });

    test('should skip empty results from convertFilter', async () => {
      convertFilter
        .mockResolvedValueOnce([{ priority: 1 }])
        .mockResolvedValueOnce([])  // Empty array
        .mockResolvedValueOnce(null); // Null result

      const rules = ['||valid.com^', '! comment line', 'unsupported'];
      const result = await converter.convert(rules, mockIdRange);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1000);
    });

    test('should stop when ID range is exceeded', async () => {
      const limitedRange = { start: 1000, end: 1001 };

      // Use mockResolvedValueOnce for each call to ensure clean state
      convertFilter
        .mockResolvedValueOnce([{ priority: 1 }])
        .mockResolvedValueOnce([{ priority: 1 }])
        .mockResolvedValueOnce([{ priority: 1 }]);

      const rules = ['||test1.com^', '||test2.com^', '||test3.com^'];
      const result = await converter.convert(rules, limitedRange);

      // Should stop after exceeding range (range allows IDs 1000-1001 = 2 rules)
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(1000);
      expect(result[1].id).toBe(1001);
    });

    test('should track conversion statistics', async () => {
      const consoleLogSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      convertFilter
        .mockResolvedValueOnce([{ priority: 1 }])
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValueOnce([]);

      const rules = ['||valid.com^', '||invalid.com^', '! comment'];
      await converter.convert(rules, mockIdRange);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[NetworkBlocking:RuleConverter]'),
        expect.stringContaining('Conversion stats:'),
        expect.any(Object)
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('convert() - JSON format', () => {
    test('should convert JSON rule to DNR format', async () => {
      const jsonRule = {
        id: 'uBO_001',
        trigger: 'doubleclick.net',
        severity: 'high',
        resourceTypes: ['xmlhttprequest']
      };

      const result = await converter.convert([jsonRule], mockIdRange);

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        id: 1000,
        priority: 2, // high severity
        action: { type: 'block' },
        condition: {
          urlFilter: '*://*doubleclick.net/*',
          resourceTypes: ['xmlhttprequest']
        }
      });
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
        { id: '1', trigger: 'low.com', severity: 'low' },
        { id: '2', trigger: 'medium.com', severity: 'medium' },
        { id: '3', trigger: 'high.com', severity: 'high' },
        { id: '4', trigger: 'critical.com', severity: 'critical' }
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
  });

  describe('convert() - Mixed formats', () => {
    test('should handle mixed EasyList and JSON rules', async () => {
      convertFilter.mockResolvedValue([{ priority: 1 }]);

      const rules = [
        '||easylist.com^', // String (EasyList)
        { id: 'uBO_001', trigger: 'json-rule.com', severity: 'high' } // Object (JSON)
      ];

      const result = await converter.convert(rules, mockIdRange);

      expect(result.length).toBe(2);
      expect(convertFilter).toHaveBeenCalledTimes(1);
      // Verify both have IDs assigned
      expect(result[0].id).toBe(1000);
      expect(result[1].id).toBe(1001);
    });
  });

  describe('convertJsonRule()', () => {
    test('should convert basic JSON rule', () => {
      const jsonRule = {
        trigger: 'example.com',
        severity: 'medium'
      };

      const result = converter.convertJsonRule(jsonRule, 5000);

      expect(result).toMatchObject({
        id: 5000,
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

      const result = converter.convertJsonRule(jsonRule, 6000);

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

      const result = converter.convertJsonRule(jsonRule, 7000);

      expect(result.condition.resourceTypes).toEqual(['image', 'media', 'font']);
    });
  });

  describe('Error handling', () => {
    test('should log warnings for failed conversions', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      convertFilter.mockRejectedValue(new Error('Conversion failed'));

      const rules = ['||broken.com^'];
      await converter.convert(rules, mockIdRange);

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should limit warning logs to first 10 failures', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      convertFilter.mockRejectedValue(new Error('fail'));

      const rules = Array(20).fill('||broken.com^');
      await converter.convert(rules, mockIdRange);

      // Should only log first 10 + 1 for stats
      const filterWarnings = consoleWarnSpy.mock.calls.filter(
        call => call[0]?.includes('Skipping invalid filter')
      );
      expect(filterWarnings.length).toBeLessThanOrEqual(10);

      consoleWarnSpy.mockRestore();
    });
  });
});
