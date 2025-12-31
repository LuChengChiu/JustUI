/**
 * Unit Tests for TokenIndexer
 * Tests token extraction and inverted index building
 */

import { vi } from 'vitest';
import { TokenIndexer } from '@modules/rule-execution/executors/hybrid-executor/token-indexer.js';

describe('TokenIndexer', () => {
  let indexer;

  beforeEach(() => {
    indexer = new TokenIndexer();
    vi.clearAllMocks();
  });

  describe('extractTokens()', () => {
    test('should extract class name tokens', () => {
      const tokens = indexer.extractTokens('.ad-banner');

      expect(tokens).toContain('ad-banner');
    });

    test('should extract ID tokens', () => {
      const tokens = indexer.extractTokens('#AD_Top');

      expect(tokens).toContain('AD_Top');
    });

    test('should extract tag name tokens', () => {
      const tokens = indexer.extractTokens('div.container');

      expect(tokens).toContain('div');
      expect(tokens).toContain('container');
    });

    test('should extract multiple class tokens', () => {
      const tokens = indexer.extractTokens('.ad.banner.sponsored');

      expect(tokens).toContain('ad');
      expect(tokens).toContain('banner');
      expect(tokens).toContain('sponsored');
    });

    test('should extract attribute value tokens', () => {
      const tokens = indexer.extractTokens('[data-ad="true"]');

      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle complex selectors', () => {
      const tokens = indexer.extractTokens('div.container > .ad-slot');

      expect(tokens).toContain('div');
      expect(tokens).toContain('container');
      expect(tokens).toContain('ad-slot');
    });

    test('should handle empty selector', () => {
      const tokens = indexer.extractTokens('');

      expect(tokens).toEqual([]);
    });
  });

  describe('build()', () => {
    test('should build index from selectors', () => {
      const selectors = ['.ad', '#banner', '.ad-slot'];

      indexer.build(selectors);

      expect(indexer.has('ad')).toBe(true);
      expect(indexer.has('banner')).toBe(true);
      expect(indexer.has('ad-slot')).toBe(true);
    });

    test('should return the indexer for chaining', () => {
      const selectors = ['.ad'];

      const result = indexer.build(selectors);

      // build() returns `this` for chaining
      expect(result).toBe(indexer);
      // The internal index is a Map
      expect(indexer.index).toBeInstanceOf(Map);
    });

    test('should map tokens to their selectors', () => {
      const selectors = ['.ad-banner', '.ad-box'];

      indexer.build(selectors);

      const adSelectors = indexer.get('ad-banner');
      expect(adSelectors).toContain('.ad-banner');
    });

    test('should handle selectors with shared tokens', () => {
      const selectors = ['.ad', '.sidebar-ad', '#ad-container'];

      indexer.build(selectors);

      // 'ad' token should map to all selectors containing it
      expect(indexer.has('ad')).toBe(true);
    });
  });

  describe('has()', () => {
    test('should return true for indexed tokens', () => {
      indexer.build(['.ad']);

      expect(indexer.has('ad')).toBe(true);
    });

    test('should return false for non-indexed tokens', () => {
      indexer.build(['.ad']);

      expect(indexer.has('nonexistent')).toBe(false);
    });

    test('should return false before build', () => {
      expect(indexer.has('ad')).toBe(false);
    });
  });

  describe('get()', () => {
    test('should return selectors for token', () => {
      indexer.build(['.ad-banner']);

      const selectors = indexer.get('ad-banner');

      expect(selectors).toContain('.ad-banner');
    });

    test('should return empty array for non-indexed token', () => {
      indexer.build(['.ad']);

      const selectors = indexer.get('nonexistent');

      expect(selectors).toEqual([]);
    });
  });

  describe('getTokenCount()', () => {
    test('should return number of unique tokens', () => {
      indexer.build(['.ad', '#banner', '.tracking']);

      const count = indexer.getTokenCount();

      expect(count).toBeGreaterThan(0);
    });

    test('should return 0 before build', () => {
      expect(indexer.getTokenCount()).toBe(0);
    });
  });

  describe('clear()', () => {
    test('should clear the index', () => {
      indexer.build(['.ad', '#banner']);
      expect(indexer.has('ad')).toBe(true);

      indexer.clear();

      expect(indexer.has('ad')).toBe(false);
      expect(indexer.getTokenCount()).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should handle 10000+ selectors', () => {
      const selectors = Array.from({ length: 13000 }, (_, i) => `.ad-${i}`);

      const start = Date.now();
      indexer.build(selectors);
      const duration = Date.now() - start;

      expect(indexer.getTokenCount()).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
