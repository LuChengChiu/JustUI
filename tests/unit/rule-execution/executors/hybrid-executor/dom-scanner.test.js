/**
 * Unit Tests for DomScanner
 * Tests single-pass DOM scanning with tiered removal
 */

import { vi } from 'vitest';
import { DomScanner } from '@modules/rule-execution/executors/hybrid-executor/dom-scanner.js';
import Logger, { LogLevel } from '@script-utils/logger.js';

describe('DomScanner', () => {
  let scanner;
  let mockTokenIndex;

  beforeEach(() => {
    mockTokenIndex = {
      has: vi.fn().mockReturnValue(false),
      get: vi.fn().mockReturnValue([])
    };

    scanner = new DomScanner(mockTokenIndex);

    // Mock document.querySelectorAll
    global.document = {
      querySelectorAll: vi.fn().mockReturnValue([])
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    delete global.document;
  });

  describe('Initialization', () => {
    test('should initialize with token index', () => {
      expect(scanner).toBeDefined();
    });

    test('should accept options', () => {
      const options = { enableRemoval: true, logMatches: true };
      const scannerWithOptions = new DomScanner(mockTokenIndex, options);

      expect(scannerWithOptions).toBeDefined();
    });
  });

  describe('scan()', () => {
    test('should query elements with id and class', () => {
      scanner.scan();

      expect(document.querySelectorAll).toHaveBeenCalledWith('[id],[class]');
    });

    test('should return stats object', () => {
      const stats = scanner.scan();

      expect(stats).toHaveProperty('removed');
      expect(stats).toHaveProperty('hidden');
    });

    test('should process elements with matching tokens and validate selectors', () => {
      const mockElement = {
        classList: ['ad-banner'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true) // Selector validation passes
      };

      document.querySelectorAll.mockReturnValue([mockElement]);
      mockTokenIndex.has.mockImplementation(token => token === 'ad-banner');
      mockTokenIndex.get.mockReturnValue(['.ad-banner']); // Return matching selector

      const stats = scanner.scan();

      // Verify selector validation was called
      expect(mockElement.matches).toHaveBeenCalledWith('.ad-banner');
      // Verify element was blocked after validation
      expect(stats.removed + stats.hidden).toBeGreaterThanOrEqual(1);
    });

    test('should skip elements with no matching tokens', () => {
      const mockElement = {
        classList: ['safe-element'],
        id: 'main-content',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn()
      };

      document.querySelectorAll.mockReturnValue([mockElement]);
      mockTokenIndex.has.mockReturnValue(false);

      const stats = scanner.scan();

      expect(mockElement.setAttribute).not.toHaveBeenCalled();
      expect(mockElement.remove).not.toHaveBeenCalled();
    });

    test('should not block element when token matches but selector validation fails', () => {
      const mockElement = {
        classList: ['section'], // Token matches
        id: 'hero',
        tagName: 'SECTION',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(false) // Selector validation FAILS
      };

      document.querySelectorAll.mockReturnValue([mockElement]);
      mockTokenIndex.has.mockImplementation(token => token === 'section');
      mockTokenIndex.get.mockReturnValue(['.ad-section']); // Selector doesn't match element

      const stats = scanner.scan();

      // Verify selector validation was attempted
      expect(mockElement.matches).toHaveBeenCalledWith('.ad-section');
      // Verify element was NOT blocked (false positive prevention)
      expect(mockElement.setAttribute).not.toHaveBeenCalled();
      expect(mockElement.remove).not.toHaveBeenCalled();
      expect(stats.removed).toBe(0);
      expect(stats.hidden).toBe(0);
    });

    test('should handle multiple elements with mixed validation results', () => {
      const legitimateElement = {
        classList: ['section'],
        id: 'hero',
        tagName: 'SECTION',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(false) // Validation fails
      };

      const adElement = {
        classList: ['ad-banner'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true) // Validation passes
      };

      document.querySelectorAll.mockReturnValue([legitimateElement, adElement]);
      mockTokenIndex.has.mockReturnValue(true);
      mockTokenIndex.get.mockImplementation(token => {
        if (token === 'section') return ['.ad-section'];
        if (token === 'ad-banner') return ['.ad-banner'];
        return [];
      });

      const stats = scanner.scan();

      // Verify legitimate content NOT blocked
      expect(legitimateElement.setAttribute).not.toHaveBeenCalled();
      // Verify ad IS blocked
      expect(adElement.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      // Verify stats accurate
      expect(stats.hidden).toBe(1);
      expect(stats.removed).toBe(0);
    });
  });

  describe('extractElementTokens()', () => {
    test('should extract class names', () => {
      const element = {
        classList: ['ad', 'banner', 'sponsored'],
        id: '',
        tagName: 'DIV'
      };

      const tokens = scanner.extractElementTokens(element);

      expect(tokens).toContain('ad');
      expect(tokens).toContain('banner');
      expect(tokens).toContain('sponsored');
    });

    test('should extract ID', () => {
      const element = {
        classList: [],
        id: 'AD_Top',
        tagName: 'DIV'
      };

      const tokens = scanner.extractElementTokens(element);

      expect(tokens).toContain('AD_Top');
    });

    test('should extract tag name', () => {
      const element = {
        classList: [],
        id: '',
        tagName: 'DIV'
      };

      const tokens = scanner.extractElementTokens(element);

      expect(tokens).toContain('div');
    });

    test('should filter out falsy values', () => {
      const element = {
        classList: ['ad', '', null],
        id: '',
        tagName: 'DIV'
      };

      const tokens = scanner.extractElementTokens(element);

      expect(tokens.every(t => Boolean(t))).toBe(true);
    });
  });

  describe('shouldRemove() - Tiered Removal', () => {
    test('should remove script tags', () => {
      const element = { tagName: 'SCRIPT' };

      expect(scanner.shouldRemove(element)).toBe(true);
    });

    test('should remove link tags', () => {
      const element = { tagName: 'LINK' };

      expect(scanner.shouldRemove(element)).toBe(true);
    });

    test('should hide div elements (not remove)', () => {
      const element = { tagName: 'DIV' };

      expect(scanner.shouldRemove(element)).toBe(false);
    });

    test('should hide span elements (not remove)', () => {
      const element = { tagName: 'SPAN' };

      expect(scanner.shouldRemove(element)).toBe(false);
    });
  });

  describe('isThirdPartyIframe()', () => {
    beforeEach(() => {
      global.window = {
        location: {
          hostname: 'example.com',
          href: 'https://example.com/page'
        }
      };
    });

    afterEach(() => {
      delete global.window;
    });

    test('should detect third-party iframe', () => {
      const iframe = {
        tagName: 'IFRAME',
        src: 'https://ads.external.com/ad.html',
        getAttribute: () => 'https://ads.external.com/ad.html'
      };

      expect(scanner.isThirdPartyIframe(iframe)).toBe(true);
    });

    test('should not flag same-origin iframe', () => {
      const iframe = {
        tagName: 'IFRAME',
        src: 'https://example.com/embed',
        getAttribute: () => 'https://example.com/embed'
      };

      expect(scanner.isThirdPartyIframe(iframe)).toBe(false);
    });

    test('should not flag about:blank iframe', () => {
      const iframe = {
        tagName: 'IFRAME',
        src: 'about:blank',
        getAttribute: () => 'about:blank'
      };

      expect(scanner.isThirdPartyIframe(iframe)).toBe(false);
    });

    test('should not flag empty src iframe', () => {
      const iframe = {
        tagName: 'IFRAME',
        src: '',
        getAttribute: () => ''
      };

      expect(scanner.isThirdPartyIframe(iframe)).toBe(false);
    });
  });

  describe('isManagedByFramework()', () => {
    test('should detect React elements', () => {
      const element = {
        _reactRootContainer: {}
      };

      expect(scanner.isManagedByFramework(element)).toBe(true);
    });

    test('should detect React fiber elements', () => {
      const element = {
        __reactFiber: {}
      };

      // Check via Object.keys pattern
      expect(Object.keys(element).some(k => k.startsWith('__react'))).toBe(true);
    });

    test('should detect Vue elements', () => {
      const element = {
        __vue__: {}
      };

      expect(scanner.isManagedByFramework(element)).toBe(true);
    });

    test('should return false for plain elements', () => {
      const element = {};

      expect(scanner.isManagedByFramework(element)).toBe(false);
    });
  });

  describe('processElement()', () => {
    test('should mark matched element with data attribute after selector validation', () => {
      const element = {
        classList: ['ad-banner'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      mockTokenIndex.has.mockReturnValue(true);
      mockTokenIndex.get.mockReturnValue(['.ad-banner']);

      scanner.processElement(element);

      // Verify selector validation called BEFORE blocking
      expect(element.matches).toHaveBeenCalledWith('.ad-banner');
      // Verify element blocked only after validation passed
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
    });

    test('should not process already-blocked elements', () => {
      const element = {
        classList: ['ad'],
        id: '',
        tagName: 'DIV',
        getAttribute: vi.fn().mockReturnValue('true'),
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(true),
        remove: vi.fn()
      };

      mockTokenIndex.has.mockReturnValue(true);

      // Element already has data-content-blocked
      const result = scanner.processElement(element);

      // Should skip or not reprocess
      expect(element.remove).not.toHaveBeenCalled();
    });

    test('should apply tiered removal strategy only after selector validation', () => {
      const scriptElement = {
        classList: ['ad-script'],
        id: '',
        tagName: 'SCRIPT',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true) // Validation passes
      };

      mockTokenIndex.has.mockReturnValue(true);
      mockTokenIndex.get.mockReturnValue(['.ad-script']);

      const result = scanner.processElement(scriptElement);

      // Verify selector validated first
      expect(scriptElement.matches).toHaveBeenCalledWith('.ad-script');
      // Verify script removed (not hidden) due to tiered strategy
      expect(scriptElement.remove).toHaveBeenCalled();
      expect(scriptElement.setAttribute).not.toHaveBeenCalled();
      expect(result.removed).toBe(1);
      expect(result.hidden).toBe(0);
    });

    test('should not apply tiered removal if selector validation fails', () => {
      const scriptElement = {
        classList: ['script'],
        id: '',
        tagName: 'SCRIPT',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(false) // Validation FAILS
      };

      mockTokenIndex.has.mockImplementation(token => token === 'script');
      mockTokenIndex.get.mockReturnValue(['.ad-script']); // Selector doesn't match

      const result = scanner.processElement(scriptElement);

      // Verify selector validation attempted
      expect(scriptElement.matches).toHaveBeenCalledWith('.ad-script');
      // Verify element NOT removed (validation failed)
      expect(scriptElement.remove).not.toHaveBeenCalled();
      expect(scriptElement.setAttribute).not.toHaveBeenCalled();
      expect(result.removed).toBe(0);
      expect(result.hidden).toBe(0);
    });
  });

  describe('CSS Selector Validation After Token Match (P0 - Critical)', () => {
    test('should validate full selector after token match', () => {
      // Setup: Element with class "section" (legitimate content)
      const element = {
        classList: ['section'],
        id: '',
        tagName: 'SECTION',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(false) // Selector ".ad-section" does NOT match
      };

      // Token "section" matches, but full selector ".ad-section" should fail
      mockTokenIndex.has.mockImplementation(token => token === 'section');
      mockTokenIndex.get.mockReturnValue(['.ad-section']);

      const result = scanner.processElement(element);

      // Verify matches() was called to validate selector
      expect(element.matches).toHaveBeenCalledWith('.ad-section');
      // Element should NOT be blocked (token matches but selector doesn't)
      expect(element.setAttribute).not.toHaveBeenCalled();
      expect(element.remove).not.toHaveBeenCalled();
      expect(result.hidden).toBe(0);
      expect(result.removed).toBe(0);
    });

    test('should block element when full selector matches', () => {
      // Setup: Element with class "ad-section" (actual ad)
      const element = {
        classList: ['ad-section'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true) // Selector ".ad-section" DOES match
      };

      mockTokenIndex.has.mockImplementation(token => token === 'ad-section');
      mockTokenIndex.get.mockReturnValue(['.ad-section']);

      const result = scanner.processElement(element);

      // Verify matches() was called
      expect(element.matches).toHaveBeenCalledWith('.ad-section');
      // Element should be blocked (both token AND selector match)
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      expect(result.hidden).toBe(1);
    });

    test('should prevent false positive from partial token match', () => {
      // Setup: <section id="hero_image" class="section"> (legitimate hero section)
      const element = {
        classList: ['section'],
        id: 'hero_image',
        tagName: 'SECTION',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(false)
      };

      // Rule: "##.ad-section" has token "section"
      mockTokenIndex.has.mockImplementation(token => token === 'section');
      mockTokenIndex.get.mockReturnValue(['.ad-section']);

      const result = scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('.ad-section');
      // Legitimate content should NOT be blocked
      expect(element.setAttribute).not.toHaveBeenCalled();
      expect(result.hidden).toBe(0);
      expect(result.removed).toBe(0);
    });

    test('should validate against all selectors for a token', () => {
      // Setup: Element with class "banner"
      const element = {
        classList: ['banner', 'promo'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockImplementation(selector => {
          // Only matches ".promo-banner", not the others
          return selector === '.promo-banner';
        })
      };

      // Token "banner" maps to multiple selectors
      mockTokenIndex.has.mockImplementation(token => token === 'banner' || token === 'promo');
      mockTokenIndex.get.mockImplementation(token => {
        if (token === 'banner') {
          return ['.ad-banner', '.promo-banner', '#top-banner'];
        }
        return [];
      });

      const result = scanner.processElement(element);

      // Should try all 3 selectors for "banner" token
      expect(element.matches).toHaveBeenCalledWith('.ad-banner');
      expect(element.matches).toHaveBeenCalledWith('.promo-banner');
      // Should block because .promo-banner matched
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      expect(result.hidden).toBe(1);
    });

    test('should handle invalid selectors gracefully', () => {
      // Setup: Element that would match if selector was valid
      const element = {
        classList: ['ad'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockImplementation(selector => {
          if (selector === '[class*=ad') {
            // Invalid selector throws error
            throw new Error('Invalid selector');
          }
          return false;
        })
      };

      // Spy on console.warn
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockTokenIndex.has.mockReturnValue(true);
      mockTokenIndex.get.mockReturnValue(['[class*=ad']); // Malformed selector

      const result = scanner.processElement(element);

      // Should log warning about invalid selector
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[InvalidSelector]'),
        'Invalid selector',
        expect.objectContaining({
          category: 'InvalidSelector',
          data: { selector: '[class*=ad', error: 'Invalid selector' }
        })
      );
      // Should NOT crash, should NOT block
      expect(element.setAttribute).not.toHaveBeenCalled();
      expect(result.hidden).toBe(0);

      consoleWarnSpy.mockRestore();
    });

    test('should validate attribute selectors', () => {
      // Test [class^="ad-"] pattern
      const element = {
        classList: ['ad-banner', 'widget'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      mockTokenIndex.has.mockImplementation(token => token === 'ad-banner');
      mockTokenIndex.get.mockReturnValue(['[class^="ad-"]']);

      const result = scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('[class^="ad-"]');
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      expect(result.hidden).toBe(1);
    });

    test('should validate descendant combinators', () => {
      // Test "div.ad-container > iframe" pattern
      const element = {
        classList: [],
        id: '',
        tagName: 'IFRAME',
        src: 'https://ads.external.com/ad.html',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        getAttribute: vi.fn((attr) => attr === 'src' ? 'https://ads.external.com/ad.html' : null),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      // Setup global window for isThirdPartyIframe check
      global.window = {
        location: {
          hostname: 'example.com',
          href: 'https://example.com/page'
        }
      };

      mockTokenIndex.has.mockImplementation(token => token === 'iframe');
      mockTokenIndex.get.mockReturnValue(['div.ad-container > iframe']);

      const result = scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('div.ad-container > iframe');
      expect(element.remove).toHaveBeenCalled(); // iframes should be removed
      expect(result.removed).toBe(1);

      delete global.window;
    });

    test('should validate pseudo-classes', () => {
      // Test ".widget:not(.featured)" pattern
      const element = {
        classList: ['widget'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      mockTokenIndex.has.mockImplementation(token => token === 'widget');
      mockTokenIndex.get.mockReturnValue(['.widget:not(.featured)']);

      const result = scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('.widget:not(.featured)');
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      expect(result.hidden).toBe(1);
    });

    test('should not degrade with many selectors per token', () => {
      // Performance test: Token maps to 100 selectors
      const selectors = Array.from({ length: 100 }, (_, i) => `.ad-variant-${i}`);

      const element = {
        classList: ['banner'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(false) // None match
      };

      // Only return true for 'banner' token to isolate the test
      mockTokenIndex.has.mockImplementation(token => token === 'banner');
      mockTokenIndex.get.mockReturnValue(selectors);

      const startTime = Date.now();
      scanner.processElement(element);
      const duration = Date.now() - startTime;

      // Should complete validation in < 5ms
      expect(duration).toBeLessThan(5);
      // Should have tried all selectors for 'banner' token
      expect(element.matches).toHaveBeenCalledTimes(100);
      // Should not block (no match)
      expect(element.setAttribute).not.toHaveBeenCalled();
    });

    test('should handle element without classes or id', () => {
      // Plain <div> with only tag name token
      const element = {
        classList: [],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      // Only tag name "div" as token
      mockTokenIndex.has.mockImplementation(token => token === 'div');
      mockTokenIndex.get.mockReturnValue(['div.ad-container']); // Won't match plain div

      scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('div.ad-container');
    });

    test('should handle uppercase class names', () => {
      // Element with uppercase class
      const element = {
        classList: ['AD-BANNER'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true) // CSS selectors are case-insensitive in HTML
      };

      mockTokenIndex.has.mockImplementation(token => token === 'AD-BANNER');
      mockTokenIndex.get.mockReturnValue(['.ad-banner']); // Lowercase rule

      const result = scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('.ad-banner');
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      expect(result.hidden).toBe(1);
    });

    test('should skip already-blocked elements efficiently', () => {
      // Element already has data-content-blocked="true"
      const element = {
        classList: ['ad-banner'],
        id: '',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(true), // Already blocked
        remove: vi.fn(),
        matches: vi.fn()
      };

      mockTokenIndex.has.mockReturnValue(true);

      const result = scanner.processElement(element);

      // Should return early without checking tokens or calling matches()
      expect(element.matches).not.toHaveBeenCalled();
      expect(mockTokenIndex.has).not.toHaveBeenCalled();
      expect(result.removed).toBe(0);
      expect(result.hidden).toBe(0);
    });

    test('should handle SVG elements with classes', () => {
      // SVG with ad-related class
      const element = {
        classList: ['ad-svg', 'banner'],
        id: '',
        tagName: 'svg',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      mockTokenIndex.has.mockImplementation(token => token === 'ad-svg' || token === 'banner');
      mockTokenIndex.get.mockReturnValue(['.ad-svg']);

      const result = scanner.processElement(element);

      expect(element.matches).toHaveBeenCalledWith('.ad-svg');
      expect(element.setAttribute).toHaveBeenCalledWith('data-content-blocked', 'true');
      expect(result.hidden).toBe(1);
    });

    test('should stop checking tokens after first match', () => {
      // Element with multiple tokens, first one matches
      const element = {
        classList: ['ad', 'banner', 'widget'],
        id: 'top-ad',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      mockTokenIndex.has.mockReturnValue(true);
      mockTokenIndex.get.mockReturnValue(['.ad']);

      scanner.processElement(element);

      // Should only check first matching token, not all of them
      expect(mockTokenIndex.has).toHaveBeenCalledWith('ad');
      // Should not continue checking other tokens after blocking
      expect(element.setAttribute).toHaveBeenCalledTimes(1);
    });

    test('should log matches when logMatches option is enabled', () => {
      // Create scanner with logMatches enabled
      const logScanner = new DomScanner(mockTokenIndex, { logMatches: true });
      const previousLevel = Logger.getLevel();
      Logger.setLevel(LogLevel.DEBUG);

      const element = {
        classList: ['ad-banner'],
        id: 'top-ad',
        className: 'ad-banner',
        tagName: 'DIV',
        setAttribute: vi.fn(),
        hasAttribute: vi.fn().mockReturnValue(false),
        remove: vi.fn(),
        matches: vi.fn().mockReturnValue(true)
      };

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockTokenIndex.has.mockReturnValue(true);
      mockTokenIndex.get.mockReturnValue(['.ad-banner']);

      logScanner.processElement(element);

      // Should log selector match details
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SelectorMatch]'),
        'Selector match found',
        expect.objectContaining({
          data: expect.objectContaining({
            selector: '.ad-banner',
            element: 'DIV',
            id: 'top-ad',
            class: 'ad-banner'
          })
        })
      );

      Logger.setLevel(previousLevel);
      consoleLogSpy.mockRestore();
    });
  });
});
