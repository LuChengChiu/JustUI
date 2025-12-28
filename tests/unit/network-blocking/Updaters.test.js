/**
 * Unit Tests for Network Blocking Updaters
 * Tests DynamicRuleUpdater and StaticRuleBuilder
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DynamicRuleUpdater } from '@/scripts/modules/network-blocking/updaters/dynamic-rule-updater.js';
import { StaticRuleBuilder } from '@/scripts/modules/network-blocking/updaters/static-rule-builder.js';

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

// Mock fs/promises for StaticRuleBuilder
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn()
  },
  mkdir: vi.fn(),
  writeFile: vi.fn()
}));

// Mock path
vi.mock('path', () => ({
  default: {
    join: (...args) => args.join('/'),
    dirname: (path) => path.split('/').slice(0, -1).join('/')
  },
  join: (...args) => args.join('/'),
  dirname: (path) => path.split('/').slice(0, -1).join('/')
}));

describe('DynamicRuleUpdater', () => {
  let updater;

  beforeEach(() => {
    updater = new DynamicRuleUpdater();
    vi.clearAllMocks();
  });

  describe('update()', () => {
    test('should update dynamic rules successfully', async () => {
      const rules = [
        { id: 1000, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*' } },
        { id: 1001, action: { type: 'block' }, condition: { urlFilter: '*://test.com/*' } }
      ];
      const idRange = { start: 1000, end: 1999 };

      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();

      await updater.update(rules, idRange);

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: expect.arrayContaining([1000, 1001, 1002]),
        addRules: rules
      });
    });

    test('should generate correct removeRuleIds array', async () => {
      const rules = [{ id: 5000 }];
      const idRange = { start: 5000, end: 5003 };

      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();

      await updater.update(rules, idRange);

      const call = chrome.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
      expect(call.removeRuleIds).toEqual([5000, 5001, 5002, 5003]);
    });

    test('should handle large ID ranges', async () => {
      const rules = [];
      const idRange = { start: 10000, end: 11999 }; // 2000 IDs

      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();

      await updater.update(rules, idRange);

      const call = chrome.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
      expect(call.removeRuleIds).toHaveLength(2000);
      expect(call.removeRuleIds[0]).toBe(10000);
      expect(call.removeRuleIds[1999]).toBe(11999);
    });

    test('should handle empty rules array', async () => {
      const rules = [];
      const idRange = { start: 1000, end: 1005 };

      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();

      await updater.update(rules, idRange);

      expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: [1000, 1001, 1002, 1003, 1004, 1005],
        addRules: []
      });
    });

    test('should log success message', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const rules = [{ id: 1000 }, { id: 1001 }];
      const idRange = { start: 1000, end: 1999 };

      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();

      await updater.update(rules, idRange);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Updated 2 dynamic rules')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1000-1999')
      );

      consoleLogSpy.mockRestore();
    });

    test('should handle Chrome API errors', async () => {
      const rules = [{ id: 1000 }];
      const idRange = { start: 1000, end: 1999 };
      const error = new Error('Chrome API error');

      chrome.declarativeNetRequest.updateDynamicRules.mockRejectedValue(error);

      await expect(updater.update(rules, idRange)).rejects.toThrow('Chrome API error');
    });

    test('should log error on failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const rules = [{ id: 1000 }];
      const idRange = { start: 1000, end: 1999 };

      chrome.declarativeNetRequest.updateDynamicRules.mockRejectedValue(
        new Error('Update failed')
      );

      await expect(updater.update(rules, idRange)).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to update dynamic rules:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('IUpdater interface compliance', () => {
    test('should implement update method', () => {
      expect(typeof updater.update).toBe('function');
    });

    test('should return Promise from update', () => {
      chrome.declarativeNetRequest.updateDynamicRules.mockResolvedValue();

      const result = updater.update([], { start: 1, end: 10 });
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

describe('StaticRuleBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new StaticRuleBuilder('output/rulesets');
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with output path', () => {
      expect(builder.outputPath).toBe('output/rulesets');
    });
  });

  describe('build()', () => {
    test('should create output directory', async () => {
      const { mkdir, writeFile } = await import('fs/promises');
      const rules = [{ id: 1 }, { id: 2 }];

      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      await builder.build(rules);

      expect(mkdir).toHaveBeenCalledWith('output/rulesets', { recursive: true });
    });

    test('should write ruleset file', async () => {
      const rules = [
        { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://ad.com/*' } }
      ];

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules);

      expect(fs.writeFile).toHaveBeenCalledWith(
        'output/rulesets/easylist-adservers.json',
        expect.stringContaining('"id": 1')
      );
    });

    test('should format JSON with 2-space indentation', async () => {
      const rules = [{ id: 1 }];

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules);

      const writeCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('easylist-adservers.json')
      );
      const json = writeCall[1];

      expect(json).toContain('[\n  {\n    "id": 1\n  }\n]');
    });

    test('should write metadata file', async () => {
      const rules = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const metadata = {
        source: 'EasyList Adservers',
        url: 'https://easylist.to/easylist/easylist_adservers.txt',
        filterCount: 47808,
        ruleCount: 47007
      };

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules, metadata);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.stringContaining('"source": "EasyList Adservers"')
      );
    });

    test('should include generatedAt timestamp in metadata', async () => {
      const rules = [{ id: 1 }];

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules, {});

      const metadataCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('metadata.json')
      );
      const metadataJson = JSON.parse(metadataCall[1]);

      expect(metadataJson).toHaveProperty('generatedAt');
      expect(metadataJson.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should include ruleCount in metadata', async () => {
      const rules = [{ id: 1 }, { id: 2 }];

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules, { source: 'Test' });

      const metadataCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('metadata.json')
      );
      const metadataJson = JSON.parse(metadataCall[1]);

      expect(metadataJson.ruleCount).toBe(2);
    });

    test('should log success message', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const rules = [{ id: 1 }, { id: 2 }, { id: 3 }];

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Built static ruleset: 3 rules')
      );

      consoleLogSpy.mockRestore();
    });

    test('should handle large rulesets', async () => {
      const rules = Array(47007).fill(null).map((_, i) => ({ id: i + 1 }));

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules, { source: 'EasyList' });

      const rulesetCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('easylist-adservers.json')
      );
      const json = JSON.parse(rulesetCall[1]);

      expect(json).toHaveLength(47007);
    });

    test('should handle file system errors', async () => {
      const rules = [{ id: 1 }];

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockRejectedValue(new Error('Permission denied'));

      await expect(builder.build(rules)).rejects.toThrow('Permission denied');
    });

    test('should handle mkdir errors', async () => {
      const rules = [{ id: 1 }];

      fs.mkdir.mockRejectedValue(new Error('Cannot create directory'));

      await expect(builder.build(rules)).rejects.toThrow('Cannot create directory');
    });

    test('should handle empty rules array', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build([]);

      const rulesetCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('easylist-adservers.json')
      );
      expect(rulesetCall[1]).toBe('[]');
    });

    test('should preserve metadata custom fields', async () => {
      const rules = [{ id: 1 }];
      const metadata = {
        source: 'Custom Source',
        customField: 'custom value',
        nested: { data: 'test' }
      };

      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      await builder.build(rules, metadata);

      const metadataCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('metadata.json')
      );
      const metadataJson = JSON.parse(metadataCall[1]);

      expect(metadataJson.source).toBe('Custom Source');
      expect(metadataJson.customField).toBe('custom value');
      expect(metadataJson.nested).toEqual({ data: 'test' });
    });
  });
});
