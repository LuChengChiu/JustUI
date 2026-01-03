/**
 * Unit Tests for Remote Data Fetcher Module
 * Tests data fetching with local fallback logic
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  REMOTE_URLS,
  fetchDefaultRules,
  fetchDefaultWhitelist,
  fetchAllDefaults
} from '@script-utils/background/remote-data-fetcher.js';

describe('Remote Data Fetcher', () => {
  let originalFetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;

    // Mock chrome.runtime.getURL
    global.chrome = {
      runtime: {
        getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`)
      }
    };
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('REMOTE_URLS constant', () => {
    test('should export REMOTE_URLS with RULES and WHITELIST', () => {
      expect(REMOTE_URLS).toHaveProperty('RULES');
      expect(REMOTE_URLS).toHaveProperty('WHITELIST');
    });

    test('RULES URL should be a valid GitHub raw URL', () => {
      expect(REMOTE_URLS.RULES).toContain('githubusercontent.com');
      expect(REMOTE_URLS.RULES).toContain('defaultRules.json');
    });

    test('WHITELIST URL should be a valid GitHub raw URL', () => {
      expect(REMOTE_URLS.WHITELIST).toContain('githubusercontent.com');
      expect(REMOTE_URLS.WHITELIST).toContain('defaultWhitelist.json');
    });
  });

  describe('fetchDefaultRules()', () => {
    describe('Local file loading (current behavior)', () => {
      test('should load rules from local file', async () => {
        const mockRules = [
          { id: 'rule1', selector: '.ad', enabled: true },
          { id: 'rule2', selector: '.tracker', enabled: true }
        ];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockRules
        });

        const result = await fetchDefaultRules();

        expect(result).toEqual(mockRules);
        expect(global.fetch).toHaveBeenCalledWith(
          'chrome-extension://test-extension-id/data/defaultRules.json'
        );
      });

      test('should return empty array on local file load failure', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('File not found'));

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await fetchDefaultRules();

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[DefaultRulesFetch]'),
          'Failed to load local default rules',
          expect.objectContaining({
            category: 'DefaultRulesFetch',
            message: 'Failed to load local default rules'
          })
        );

        consoleErrorSpy.mockRestore();
      });

      test('should handle JSON parse error gracefully', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          }
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await fetchDefaultRules();

        expect(result).toEqual([]);

        consoleErrorSpy.mockRestore();
      });

      test('should log success message when loading local rules', async () => {
        const mockRules = [{ id: 'rule1' }];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockRules
        });

        const consoleLogSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

        await fetchDefaultRules();

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[DefaultRulesFetch]'),
          'Using local default rules',
          expect.objectContaining({
            data: { count: mockRules.length }
          })
        );

        consoleLogSpy.mockRestore();
      });
    });

    describe('Return value validation', () => {
      test('should always return an array', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => []
        });

        const result = await fetchDefaultRules();

        expect(Array.isArray(result)).toBe(true);
      });

      test('should return empty array on failure, never null or undefined', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await fetchDefaultRules();

        expect(result).toEqual([]);
        expect(result).not.toBeNull();
        expect(result).not.toBeUndefined();
      });
    });
  });

  describe('fetchDefaultWhitelist()', () => {
    describe('Local file loading (current behavior)', () => {
      test('should load whitelist from local file', async () => {
        const mockWhitelist = ['example.com', 'google.com', 'github.com'];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockWhitelist
        });

        const result = await fetchDefaultWhitelist();

        expect(result).toEqual(mockWhitelist);
        expect(global.fetch).toHaveBeenCalledWith(
          'chrome-extension://test-extension-id/data/defaultWhitelist.json'
        );
      });

      test('should return empty array on local file load failure', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('File not found'));

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await fetchDefaultWhitelist();

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[DefaultWhitelistFetch]'),
          'Failed to load local default whitelist',
          expect.objectContaining({
            category: 'DefaultWhitelistFetch',
            message: 'Failed to load local default whitelist'
          })
        );

        consoleErrorSpy.mockRestore();
      });

      test('should handle JSON parse error gracefully', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          }
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await fetchDefaultWhitelist();

        expect(result).toEqual([]);

        consoleErrorSpy.mockRestore();
      });

      test('should log success message when loading local whitelist', async () => {
        const mockWhitelist = ['example.com'];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockWhitelist
        });

        const consoleLogSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

        await fetchDefaultWhitelist();

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[DefaultWhitelistFetch]'),
          'Using local default whitelist',
          expect.objectContaining({
            data: { count: mockWhitelist.length }
          })
        );

        consoleLogSpy.mockRestore();
      });
    });

    describe('Return value validation', () => {
      test('should always return an array', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => []
        });

        const result = await fetchDefaultWhitelist();

        expect(Array.isArray(result)).toBe(true);
      });

      test('should return empty array on failure, never null or undefined', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await fetchDefaultWhitelist();

        expect(result).toEqual([]);
        expect(result).not.toBeNull();
        expect(result).not.toBeUndefined();
      });
    });
  });

  describe('fetchAllDefaults()', () => {
    test('should fetch both rules and whitelist in parallel', async () => {
      const mockRules = [{ id: 'rule1' }];
      const mockWhitelist = ['example.com'];

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRules
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWhitelist
        });

      const result = await fetchAllDefaults();

      expect(result).toEqual({
        rules: mockRules,
        whitelist: mockWhitelist
      });
    });

    test('should call both fetch functions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      });

      await fetchAllDefaults();

      // Should be called twice (once for rules, once for whitelist)
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('defaultRules.json')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('defaultWhitelist.json')
      );
    });

    test('should return empty arrays for both on failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await fetchAllDefaults();

      expect(result).toEqual({
        rules: [],
        whitelist: []
      });
    });

    test('should handle partial failure gracefully', async () => {
      const mockRules = [{ id: 'rule1' }];

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRules
        })
        .mockRejectedValueOnce(new Error('Whitelist fetch failed'));

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await fetchAllDefaults();

      expect(result).toEqual({
        rules: mockRules,
        whitelist: []
      });
    });

    test('should execute fetches in parallel, not sequentially', async () => {
      const startTime = Date.now();

      global.fetch = vi.fn().mockImplementation(async (url) => {
        // Simulate 100ms delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => []
        };
      });

      await fetchAllDefaults();

      const duration = Date.now() - startTime;

      // If parallel: ~100ms, if sequential: ~200ms
      // We expect it to be closer to 100ms (parallel) than 200ms (sequential)
      expect(duration).toBeLessThan(180); // Allow some buffer
    });
  });

  describe('Error handling', () => {
    test('should handle network timeout gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const rules = await fetchDefaultRules();
      const whitelist = await fetchDefaultWhitelist();

      expect(rules).toEqual([]);
      expect(whitelist).toEqual([]);
    });

    test('should handle malformed JSON gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        }
      });

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const rules = await fetchDefaultRules();
      const whitelist = await fetchDefaultWhitelist();

      expect(rules).toEqual([]);
      expect(whitelist).toEqual([]);
    });

    test('should handle 404 response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => {
          throw new Error('Not found');
        }
      });

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const rules = await fetchDefaultRules();

      expect(rules).toEqual([]);
    });
  });

  describe('Chrome runtime integration', () => {
    test('should use chrome.runtime.getURL for local file paths', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      });

      await fetchDefaultRules();

      expect(chrome.runtime.getURL).toHaveBeenCalledWith('data/defaultRules.json');
    });

    test('should handle chrome.runtime.getURL returning different base URLs', async () => {
      chrome.runtime.getURL = vi.fn((path) => `chrome-extension://different-id/${path}`);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      });

      await fetchDefaultWhitelist();

      expect(global.fetch).toHaveBeenCalledWith(
        'chrome-extension://different-id/data/defaultWhitelist.json'
      );
    });
  });

  describe('Data validation', () => {
    test('should accept and return valid rules array', async () => {
      const validRules = [
        { id: 'rule1', selector: '.ad', enabled: true },
        { id: 'rule2', selector: '#tracker', enabled: false }
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => validRules
      });

      const result = await fetchDefaultRules();

      expect(result).toEqual(validRules);
    });

    test('should accept and return valid whitelist array', async () => {
      const validWhitelist = [
        'example.com',
        'google.com',
        '*.github.com'
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => validWhitelist
      });

      const result = await fetchDefaultWhitelist();

      expect(result).toEqual(validWhitelist);
    });

    test('should accept empty arrays', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      });

      const rules = await fetchDefaultRules();
      const whitelist = await fetchDefaultWhitelist();

      expect(rules).toEqual([]);
      expect(whitelist).toEqual([]);
    });
  });
});
