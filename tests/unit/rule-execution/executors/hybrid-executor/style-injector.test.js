/**
 * Unit Tests for StyleInjector
 * Tests CSS injection for declarative element hiding
 */

import { vi } from 'vitest';
import { StyleInjector } from '@modules/rule-execution/executors/hybrid-executor/style-injector.js';

describe('StyleInjector', () => {
  let injector;
  let mockHead;
  let mockStyleElement;

  beforeEach(() => {
    injector = new StyleInjector();

    // Create mock elements
    mockStyleElement = {
      id: '',
      textContent: '',
      remove: vi.fn(),
      setAttribute: vi.fn()
    };

    mockHead = {
      appendChild: vi.fn()
    };

    // Mock document
    global.document = {
      createElement: vi.fn().mockReturnValue(mockStyleElement),
      head: mockHead,
      getElementById: vi.fn().mockReturnValue(null),
      contains: vi.fn().mockReturnValue(true)
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    delete global.document;
  });

  describe('inject()', () => {
    test('should create style element', () => {
      const selectors = ['.ad', '#banner'];

      injector.inject(selectors);

      expect(document.createElement).toHaveBeenCalledWith('style');
    });

    test('should set style element id', () => {
      const selectors = ['.ad'];

      injector.inject(selectors);

      expect(mockStyleElement.id).toBe('easylist-hide-rules');
    });

    test('should append style to head', () => {
      const selectors = ['.ad'];

      injector.inject(selectors);

      expect(mockHead.appendChild).toHaveBeenCalledWith(mockStyleElement);
    });

    test('should return number of selectors injected', () => {
      const selectors = ['.ad', '#banner', '.tracking'];

      const count = injector.inject(selectors);

      expect(count).toBe(3);
    });

    test('should generate CSS with display:none', () => {
      const selectors = ['.ad'];

      injector.inject(selectors);

      expect(mockStyleElement.textContent).toContain('display: none !important');
    });

    test('should combine multiple selectors', () => {
      const selectors = ['.ad', '#banner'];

      injector.inject(selectors);

      expect(mockStyleElement.textContent).toContain('.ad');
      expect(mockStyleElement.textContent).toContain('#banner');
    });

    test('should handle empty selectors array', () => {
      const count = injector.inject([]);

      expect(count).toBe(0);
      expect(document.createElement).not.toHaveBeenCalled();
    });

    test('should include data-content-blocked rule', () => {
      const selectors = ['.ad'];

      injector.inject(selectors);

      expect(mockStyleElement.textContent).toContain('[data-content-blocked="true"]');
    });
  });

  describe('isInjected()', () => {
    test('should return false before inject', () => {
      expect(injector.isInjected()).toBe(false);
    });

    test('should return true after inject', () => {
      injector.inject(['.ad']);

      expect(injector.isInjected()).toBe(true);
    });
  });

  describe('cleanup()', () => {
    test('should remove style element', () => {
      injector.inject(['.ad']);

      injector.cleanup();

      expect(mockStyleElement.remove).toHaveBeenCalled();
    });

    test('should set styleElement to null', () => {
      injector.inject(['.ad']);

      injector.cleanup();

      expect(injector.isInjected()).toBe(false);
    });

    test('should handle cleanup before inject', () => {
      expect(() => injector.cleanup()).not.toThrow();
    });
  });

  describe('Large Selector Sets', () => {
    test('should handle 10000+ selectors', () => {
      const selectors = Array.from({ length: 13000 }, (_, i) => `.ad-${i}`);

      const count = injector.inject(selectors);

      expect(count).toBe(13000);
      expect(mockStyleElement.textContent.length).toBeGreaterThan(0);
    });
  });
});
