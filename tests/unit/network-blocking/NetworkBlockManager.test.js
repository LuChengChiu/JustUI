/**
 * Unit Tests for NetworkBlockManager
 * Tests orchestration of rule sources, parsers, converters, and updaters
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { NetworkBlockManager } from '@modules/network-blocking/core/network-block-manager.js';

describe('NetworkBlockManager', () => {
  let manager;
  let mockSources;
  let mockUpdater;
  let mockParser;
  let mockConverter;

  beforeEach(() => {
    // Mock source
    const mockSource = {
      getName: vi.fn().mockReturnValue('Test Source'),
      fetchRules: vi.fn().mockResolvedValue('||example.com^'),
      getRuleIdRange: vi.fn().mockReturnValue({ start: 1000, end: 2000 }),
      getUpdateInterval: vi.fn().mockReturnValue(1440),
      getUpdateType: vi.fn().mockReturnValue('dynamic')
    };

    mockSources = [mockSource];

    // Mock updater
    mockUpdater = {
      update: vi.fn().mockResolvedValue()
    };

    // Mock parser
    mockParser = {
      parse: vi.fn().mockResolvedValue(['||example.com^'])
    };

    // Mock converter
    mockConverter = {
      convert: vi.fn().mockResolvedValue([
        { id: 1000, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*' } }
      ])
    };

    manager = new NetworkBlockManager(
      mockSources,
      mockUpdater,
      mockParser,
      mockConverter
    );

    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(manager.sources).toBe(mockSources);
      expect(manager.updater).toBe(mockUpdater);
      expect(manager.parser).toBe(mockParser);
      expect(manager.converter).toBe(mockConverter);
    });

    test('should accept multiple sources', () => {
      const source1 = { getName: () => 'Source 1', getUpdateType: () => 'dynamic' };
      const source2 = { getName: () => 'Source 2', getUpdateType: () => 'dynamic' };

      const multiManager = new NetworkBlockManager(
        [source1, source2],
        mockUpdater,
        mockParser,
        mockConverter
      );

      expect(multiManager.sources).toHaveLength(2);
    });
  });

  describe('updateAll()', () => {
    test('should update all dynamic sources', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const results = await manager.updateAll();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        source: 'Test Source',
        success: true,
        ruleCount: 1
      });

      consoleLogSpy.mockRestore();
    });

    test('should skip static sources', async () => {
      const staticSource = {
        getName: vi.fn().mockReturnValue('Static Source'),
        fetchRules: vi.fn(),
        getUpdateType: vi.fn().mockReturnValue('static')
      };

      const mixedManager = new NetworkBlockManager(
        [mockSources[0], staticSource],
        mockUpdater,
        mockParser,
        mockConverter
      );

      const results = await mixedManager.updateAll();

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('Test Source');
      expect(staticSource.fetchRules).not.toHaveBeenCalled();
    });

    test('should handle multiple dynamic sources', async () => {
      const source2 = {
        getName: vi.fn().mockReturnValue('Source 2'),
        fetchRules: vi.fn().mockResolvedValue('||test.com^'),
        getRuleIdRange: vi.fn().mockReturnValue({ start: 2000, end: 3000 }),
        getUpdateType: vi.fn().mockReturnValue('dynamic')
      };

      const multiManager = new NetworkBlockManager(
        [mockSources[0], source2],
        mockUpdater,
        mockParser,
        mockConverter
      );

      mockParser.parse.mockResolvedValue(['||test.com^']);
      mockConverter.convert.mockResolvedValue([{ id: 2000 }]);

      const results = await multiManager.updateAll();

      expect(results).toHaveLength(2);
      expect(results[0].source).toBe('Test Source');
      expect(results[1].source).toBe('Source 2');
    });

    test('should throw error when source fetch fails in Phase 1', async () => {
      // Note: The implementation fetches ALL sources first (Phase 1) before processing.
      // Errors in Phase 1 propagate up; error handling is only in Phase 3 (processing).
      mockSources[0].fetchRules.mockRejectedValue(new Error('Network error'));

      await expect(manager.updateAll()).rejects.toThrow('Network error');
    });

    test('should handle processing errors gracefully in Phase 3', async () => {
      // Errors during the conversion/update phase (Phase 3) are caught
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // fetchRules succeeds, but converter fails
      mockSources[0].fetchRules.mockResolvedValue('||example.com^');
      mockConverter.convert.mockRejectedValue(new Error('Conversion error'));

      const results = await manager.updateAll();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        source: 'Test Source',
        success: false,
        error: 'Conversion error'
      });

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    test('should throw error when any source fails during fetch phase', async () => {
      const source2 = {
        getName: vi.fn().mockReturnValue('Source 2'),
        fetchRules: vi.fn().mockResolvedValue('||test.com^'),
        getRuleIdRange: vi.fn().mockReturnValue({ start: 2000, end: 3000 }),
        getUpdateType: vi.fn().mockReturnValue('dynamic')
      };

      // First source fails during fetch
      mockSources[0].fetchRules.mockRejectedValue(new Error('Failed'));

      const multiManager = new NetworkBlockManager(
        [mockSources[0], source2],
        mockUpdater,
        mockParser,
        mockConverter
      );

      // Phase 1 errors propagate - the whole updateAll() throws
      await expect(multiManager.updateAll()).rejects.toThrow('Failed');
    });

    test('should return empty array when no dynamic sources', async () => {
      const staticSource = {
        getName: vi.fn().mockReturnValue('Static'),
        getUpdateType: vi.fn().mockReturnValue('static')
      };

      const staticManager = new NetworkBlockManager(
        [staticSource],
        mockUpdater,
        mockParser,
        mockConverter
      );

      const results = await staticManager.updateAll();

      expect(results).toEqual([]);
    });
  });

  describe('updateSource()', () => {
    test('should fetch rules from source', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateSource(mockSources[0]);

      expect(mockSources[0].fetchRules).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    test('should parse fetched rules', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateSource(mockSources[0]);

      expect(mockParser.parse).toHaveBeenCalledWith('||example.com^');

      consoleLogSpy.mockRestore();
    });

    test('should convert parsed rules to DNR format', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateSource(mockSources[0]);

      expect(mockConverter.convert).toHaveBeenCalledWith(
        ['||example.com^'],
        { start: 1000, end: 2000 }
      );

      consoleLogSpy.mockRestore();
    });

    test('should update rules via updater', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateSource(mockSources[0]);

      expect(mockUpdater.update).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 1000 })
        ]),
        { start: 1000, end: 2000 }
      );

      consoleLogSpy.mockRestore();
    });

    test('should return rule count', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await manager.updateSource(mockSources[0]);

      expect(result).toEqual({ ruleCount: 1 });

      consoleLogSpy.mockRestore();
    });

    test('should log update progress', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateSource(mockSources[0]);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔄 Updating Test Source')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Updated 1 rules for Test Source')
      );

      consoleLogSpy.mockRestore();
    });

    test('should throw error on fetch failure', async () => {
      mockSources[0].fetchRules.mockRejectedValue(new Error('Fetch failed'));

      await expect(manager.updateSource(mockSources[0])).rejects.toThrow('Fetch failed');
    });

    test('should throw error on parse failure', async () => {
      mockParser.parse.mockRejectedValue(new Error('Parse error'));

      await expect(manager.updateSource(mockSources[0])).rejects.toThrow('Parse error');
    });

    test('should throw error on convert failure', async () => {
      mockConverter.convert.mockRejectedValue(new Error('Conversion error'));

      await expect(manager.updateSource(mockSources[0])).rejects.toThrow('Conversion error');
    });

    test('should throw error on update failure', async () => {
      mockUpdater.update.mockRejectedValue(new Error('Update error'));

      await expect(manager.updateSource(mockSources[0])).rejects.toThrow('Update error');
    });
  });

  describe('updateByInterval()', () => {
    test('should update sources matching interval', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateByInterval(1440);

      expect(mockSources[0].fetchRules).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    test('should skip sources not matching interval', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await manager.updateByInterval(10080); // Different interval

      expect(mockSources[0].fetchRules).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    test('should skip static sources', async () => {
      const staticSource = {
        getName: vi.fn().mockReturnValue('Static'),
        fetchRules: vi.fn(),
        getUpdateInterval: vi.fn().mockReturnValue(1440),
        getUpdateType: vi.fn().mockReturnValue('static')
      };

      const mixedManager = new NetworkBlockManager(
        [staticSource],
        mockUpdater,
        mockParser,
        mockConverter
      );

      await mixedManager.updateByInterval(1440);

      expect(staticSource.fetchRules).not.toHaveBeenCalled();
    });

    test('should update multiple sources with same interval', async () => {
      const source2 = {
        getName: vi.fn().mockReturnValue('Source 2'),
        fetchRules: vi.fn().mockResolvedValue('||test.com^'),
        getRuleIdRange: vi.fn().mockReturnValue({ start: 2000, end: 3000 }),
        getUpdateInterval: vi.fn().mockReturnValue(1440),
        getUpdateType: vi.fn().mockReturnValue('dynamic')
      };

      const multiManager = new NetworkBlockManager(
        [mockSources[0], source2],
        mockUpdater,
        mockParser,
        mockConverter
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await multiManager.updateByInterval(1440);

      expect(mockSources[0].fetchRules).toHaveBeenCalled();
      expect(source2.fetchRules).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    test('should handle no matching sources', async () => {
      await expect(manager.updateByInterval(99999)).resolves.not.toThrow();
    });
  });

  describe('Dependency Injection (DIP)', () => {
    test('should work with any IRuleSource implementation', async () => {
      const customSource = {
        getName: () => 'Custom',
        fetchRules: async () => 'custom-rule',
        getRuleIdRange: () => ({ start: 100, end: 200 }),
        getUpdateInterval: () => 60,
        getUpdateType: () => 'dynamic'
      };

      const customManager = new NetworkBlockManager(
        [customSource],
        mockUpdater,
        mockParser,
        mockConverter
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(customManager.updateAll()).resolves.toBeDefined();

      consoleLogSpy.mockRestore();
    });

    test('should work with any IParser implementation', async () => {
      const customParser = {
        parse: async (content) => [content + '-parsed']
      };

      const customManager = new NetworkBlockManager(
        mockSources,
        mockUpdater,
        customParser,
        mockConverter
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await customManager.updateSource(mockSources[0]);

      expect(mockConverter.convert).toHaveBeenCalledWith(
        ['||example.com^-parsed'],
        expect.any(Object)
      );

      consoleLogSpy.mockRestore();
    });

    test('should work with any IUpdater implementation', async () => {
      const customUpdater = {
        update: vi.fn().mockResolvedValue()
      };

      const customManager = new NetworkBlockManager(
        mockSources,
        customUpdater,
        mockParser,
        mockConverter
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await customManager.updateSource(mockSources[0]);

      expect(customUpdater.update).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });
});
