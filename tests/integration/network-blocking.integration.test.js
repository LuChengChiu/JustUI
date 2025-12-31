/**
 * Integration Tests for Network Blocking System
 * Tests complete flow from source fetch to rule updates
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { NetworkBlockManager } from '@modules/network-blocking/core/network-block-manager.js';
import { EasyListSource, DefaultBlockSource } from '@modules/network-blocking/sources/index.js';
import { DynamicRuleUpdater } from '@modules/network-blocking/updaters/dynamic-rule-updater.js';
import { EasyListParser } from '@modules/network-blocking/parsers/easylist-parser.js';
import { JsonRuleParser } from '@modules/network-blocking/parsers/json-rule-parser.js';
import { RuleConverter } from '@modules/network-blocking/core/rule-converter.js';

// Mock Chrome API
global.chrome = {
  declarativeNetRequest: {
    updateDynamicRules: vi.fn()
  },
  runtime: {
    lastError: null,
    id: 'test-extension-id'
  }
};

// Mock fetch
global.fetch = vi.fn();

// Mock @eyeo/abp2dnr
vi.mock('@eyeo/abp2dnr', () => ({
  convertFilter: vi.fn()
}));

import { convertFilter } from '@eyeo/abp2dnr';

describe('Network Blocking System Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();
  });

  describe('EasyList Processing Pipeline', () => {
    test('should fetch, parse, convert, and update EasyList rules', async () => {
      // Setup
      const easylistContent = `
! EasyList Comment
||doubleclick.net^
||google-analytics.com^$third-party
||ads.example.com^$script
      `.trim();

      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(easylistContent)
      });

      convertFilter
        .mockResolvedValueOnce([{ id: 1000, condition: { urlFilter: '*://doubleclick.net/*' } }])
        .mockResolvedValueOnce([{ id: 1001, condition: { urlFilter: '*://google-analytics.com/*' } }])
        .mockResolvedValueOnce([{ id: 1002, condition: { urlFilter: '*://ads.example.com/*' } }]);

      const source = new EasyListSource(
        'EasyList Test',
        'https://test.com/easylist.txt',
        1000,
        2000,
        10080
      );

      const manager = new NetworkBlockManager(
        [source],
        new DynamicRuleUpdater(),
        new EasyListParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Execute
      const results = await manager.updateAll();

      // Verify
      expect(fetch).toHaveBeenCalledWith('https://test.com/easylist.txt');
      expect(convertFilter).toHaveBeenCalledTimes(3);
      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: expect.any(Array),
        addRules: expect.arrayContaining([
          expect.objectContaining({ id: 1000 }),
          expect.objectContaining({ id: 1001 }),
          expect.objectContaining({ id: 1002 })
        ])
      });
      expect(results[0].success).toBe(true);
      expect(results[0].ruleCount).toBe(3);

      consoleLogSpy.mockRestore();
    });

    test('should handle mixed valid and invalid EasyList rules', async () => {
      const easylistContent = `
||valid1.com^
/(invalid)regex/
||valid2.com^
! comment
||valid3.com^
      `.trim();

      fetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(easylistContent)
      });

      convertFilter
        .mockResolvedValueOnce([{ id: 1000 }])
        .mockRejectedValueOnce(new Error('invalid_regexp'))
        .mockResolvedValueOnce([{ id: 1001 }])
        .mockResolvedValueOnce([{ id: 1002 }]);

      const source = new EasyListSource(
        'Mixed Rules',
        'https://test.com/mixed.txt',
        1000,
        2000,
        10080
      );

      const manager = new NetworkBlockManager(
        [source],
        new DynamicRuleUpdater(),
        new EasyListParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const results = await manager.updateAll();

      expect(results[0].success).toBe(true);
      expect(results[0].ruleCount).toBe(3); // 3 valid rules

      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('JSON DefaultBlockRequests Pipeline', () => {
    test('should fetch, parse, convert, and update JSON rules', async () => {
      const jsonContent = [
        {
          id: 'uBO_001',
          trigger: 'doubleclick.net',
          severity: 'high',
          resourceTypes: ['xmlhttprequest']
        },
        {
          id: 'uBO_002',
          trigger: 'tracker.io',
          severity: 'critical',
          resourceTypes: ['script']
        }
      ];

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(jsonContent)
      });

      const source = new DefaultBlockSource(
        'Default Blocks',
        'https://test.com/blocks.json',
        50000,
        50999,
        1440
      );

      const manager = new NetworkBlockManager(
        [source],
        new DynamicRuleUpdater(),
        new JsonRuleParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const results = await manager.updateAll();

      expect(fetch).toHaveBeenCalledWith('https://test.com/blocks.json');
      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: expect.any(Array),
        addRules: expect.arrayContaining([
          expect.objectContaining({
            id: 50000,
            priority: 2, // high severity
            condition: expect.objectContaining({
              urlFilter: '*://*doubleclick.net/*'
            })
          }),
          expect.objectContaining({
            id: 50001,
            priority: 3, // critical severity
            condition: expect.objectContaining({
              urlFilter: '*://*tracker.io/*'
            })
          })
        ])
      });
      expect(results[0].success).toBe(true);

      consoleLogSpy.mockRestore();
    });
  });

  describe('Multi-Source Management', () => {
    test('should update multiple sources independently', async () => {
      // Setup EasyList source
      const easylistContent = '||easylist.com^';
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(easylistContent)
      }));

      convertFilter.mockResolvedValue([{ id: 1000 }]);

      // Setup JSON source
      const jsonContent = [{ id: 'uBO_001', trigger: 'json.com', severity: 'high' }];
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(jsonContent)
      }));

      const easylistSource = new EasyListSource(
        'EasyList',
        'https://test.com/easylist.txt',
        1000,
        2000,
        10080
      );

      const jsonSource = new DefaultBlockSource(
        'JSON',
        'https://test.com/json.json',
        50000,
        50999,
        1440
      );

      // Create separate managers for different parsers
      const easylistManager = new NetworkBlockManager(
        [easylistSource],
        new DynamicRuleUpdater(),
        new EasyListParser(),
        new RuleConverter()
      );

      const jsonManager = new NetworkBlockManager(
        [jsonSource],
        new DynamicRuleUpdater(),
        new JsonRuleParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Execute
      const easylistResults = await easylistManager.updateAll();
      const jsonResults = await jsonManager.updateAll();

      // Verify
      expect(easylistResults[0].success).toBe(true);
      expect(jsonResults[0].success).toBe(true);
      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledTimes(2);

      consoleLogSpy.mockRestore();
    });

    test('should handle one source failing without affecting others', async () => {
      // Failing source
      fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));

      // Successful source
      const jsonContent = [{ id: 'uBO_001', trigger: 'test.com', severity: 'high' }];
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(jsonContent)
      }));

      const failingSource = new DefaultBlockSource(
        'Failing',
        'https://fail.com/blocks.json',
        40000,
        40999,
        1440
      );

      const successSource = new DefaultBlockSource(
        'Success',
        'https://success.com/blocks.json',
        50000,
        50999,
        1440
      );

      const manager = new NetworkBlockManager(
        [failingSource, successSource],
        new DynamicRuleUpdater(),
        new JsonRuleParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const results = await manager.updateAll();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Update by Interval', () => {
    test('should selectively update sources based on interval', async () => {
      const weeklyContent = '||weekly.com^';
      const dailyContent = [{ id: 'uBO_001', trigger: 'daily.com', severity: 'high' }];

      fetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          text: () => Promise.resolve(weeklyContent)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve(dailyContent)
        }));

      convertFilter.mockResolvedValue([{ id: 1000 }]);

      const weeklySource = new EasyListSource(
        'Weekly',
        'https://test.com/weekly.txt',
        1000,
        2000,
        10080 // 7 days
      );

      const dailySource = new DefaultBlockSource(
        'Daily',
        'https://test.com/daily.json',
        50000,
        50999,
        1440 // 1 day
      );

      const weeklyManager = new NetworkBlockManager(
        [weeklySource],
        new DynamicRuleUpdater(),
        new EasyListParser(),
        new RuleConverter()
      );

      const dailyManager = new NetworkBlockManager(
        [dailySource],
        new DynamicRuleUpdater(),
        new JsonRuleParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Update only daily
      await dailyManager.updateByInterval(1440);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('https://test.com/daily.json');

      // Update only weekly
      await weeklyManager.updateByInterval(10080);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledWith('https://test.com/weekly.txt');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Error Recovery', () => {
    test('should retry failed source on next update', async () => {
      const content = [{ id: 'uBO_001', trigger: 'test.com', severity: 'high' }];

      // First call fails
      fetch.mockImplementationOnce(() => Promise.reject(new Error('Timeout')));

      // Second call succeeds
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(content)
      }));

      const source = new DefaultBlockSource(
        'Retry Test',
        'https://test.com/blocks.json',
        50000,
        50999,
        1440
      );

      const manager = new NetworkBlockManager(
        [source],
        new DynamicRuleUpdater(),
        new JsonRuleParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First attempt fails
      const firstResults = await manager.updateAll();
      expect(firstResults[0].success).toBe(false);

      // Second attempt succeeds
      const secondResults = await manager.updateAll();
      expect(secondResults[0].success).toBe(true);

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('SOLID Principles Verification', () => {
    test('should allow easy addition of new source types (OCP)', async () => {
      // Custom source implementation
      class CustomSource {
        getName() { return 'Custom'; }
        async fetchRules() { return ['custom-rule']; }
        getRuleIdRange() { return { start: 60000, end: 60999 }; }
        getUpdateInterval() { return 60; }
        getUpdateType() { return 'dynamic'; }
      }

      // Custom parser implementation
      class CustomParser {
        async parse(content) { return content; }
      }

      const customSource = new CustomSource();
      const manager = new NetworkBlockManager(
        [customSource],
        new DynamicRuleUpdater(),
        new CustomParser(),
        new RuleConverter()
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Should work without modifying existing code
      await expect(manager.updateAll()).resolves.toBeDefined();

      consoleLogSpy.mockRestore();
    });
  });
});
