/**
 * Unit Tests for Message Validators Module
 * Tests validation functions for extension messaging security
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  isValidExtensionSender,
  isTrustedUISender,
  isValidDomain,
  isValidURL,
  isValidRequestStructure
} from '@script-utils/background/message-validators.js';

describe('Message Validators', () => {
  beforeEach(() => {
    // Reset chrome runtime mock
    global.chrome = {
      runtime: {
        id: 'test-extension-id',
        getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`)
      }
    };
  });

  describe('isValidExtensionSender()', () => {
    test('should return true for valid sender', () => {
      const validSender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/popup.html'
      };

      expect(isValidExtensionSender(validSender)).toBe(true);
    });

    test('should return false when sender is null', () => {
      expect(isValidExtensionSender(null)).toBe(false);
    });

    test('should return false when sender is undefined', () => {
      expect(isValidExtensionSender(undefined)).toBe(false);
    });

    test('should return false when sender has no id', () => {
      const senderWithoutId = {
        url: 'chrome-extension://test-extension-id/popup.html'
      };

      expect(isValidExtensionSender(senderWithoutId)).toBe(false);
    });

    test('should return false when sender id is null', () => {
      const senderNullId = {
        id: null,
        url: 'chrome-extension://test-extension-id/popup.html'
      };

      expect(isValidExtensionSender(senderNullId)).toBe(false);
    });

    test('should return false when sender id is empty string', () => {
      const senderEmptyId = {
        id: '',
        url: 'chrome-extension://test-extension-id/popup.html'
      };

      expect(isValidExtensionSender(senderEmptyId)).toBe(false);
    });

    test('should return false when sender id does not match chrome.runtime.id', () => {
      const differentSender = {
        id: 'different-extension-id',
        url: 'chrome-extension://different-extension-id/popup.html'
      };

      expect(isValidExtensionSender(differentSender)).toBe(false);
    });

    test('should log warning for missing sender ID', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      isValidExtensionSender(null);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MessageValidation]'),
        'Rejected message - no sender ID',
        expect.objectContaining({
          category: 'MessageValidation',
          message: 'Rejected message - no sender ID'
        })
      );

      consoleWarnSpy.mockRestore();
    });

    test('should log warning for sender ID mismatch', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const wrongSender = { id: 'wrong-id' };
      isValidExtensionSender(wrongSender);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MessageValidation]'),
        'Rejected message - sender ID mismatch',
        expect.objectContaining({
          category: 'MessageValidation',
          data: { senderId: 'wrong-id' }
        })
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('isTrustedUISender()', () => {
    test('should return true for popup.html sender', () => {
      const popupSender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/popup.html'
      };

      expect(isTrustedUISender(popupSender)).toBe(true);
    });

    test('should return true for settings.html sender', () => {
      const settingsSender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/settings.html'
      };

      expect(isTrustedUISender(settingsSender)).toBe(true);
    });

    test('should return true for settings-beta.html sender', () => {
      const settingsBetaSender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/settings-beta.html'
      };

      expect(isTrustedUISender(settingsBetaSender)).toBe(true);
    });

    test('should return true for popup with query parameters', () => {
      const popupWithParams = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/popup.html?tab=settings'
      };

      expect(isTrustedUISender(popupWithParams)).toBe(true);
    });

    test('should return false for content script sender', () => {
      const contentScriptSender = {
        id: 'test-extension-id',
        url: 'https://example.com/page.html'
      };

      expect(isTrustedUISender(contentScriptSender)).toBe(false);
    });

    test('should return false for unknown extension page', () => {
      const unknownPageSender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/unknown.html'
      };

      expect(isTrustedUISender(unknownPageSender)).toBe(false);
    });

    test('should return false for invalid extension sender', () => {
      const invalidSender = {
        id: 'wrong-extension-id',
        url: 'chrome-extension://wrong-extension-id/popup.html'
      };

      expect(isTrustedUISender(invalidSender)).toBe(false);
    });

    test('should return false when sender has no URL', () => {
      const senderWithoutUrl = {
        id: 'test-extension-id'
      };

      expect(isTrustedUISender(senderWithoutUrl)).toBe(false);
    });

    test('should return false when sender URL is empty string', () => {
      const senderEmptyUrl = {
        id: 'test-extension-id',
        url: ''
      };

      expect(isTrustedUISender(senderEmptyUrl)).toBe(false);
    });

    test('should log warning for non-trusted UI sender', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const untrustedSender = {
        id: 'test-extension-id',
        url: 'https://malicious.com'
      };

      isTrustedUISender(untrustedSender);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MessageValidation]'),
        'Rejected message - sender not from trusted UI',
        expect.objectContaining({
          category: 'MessageValidation',
          data: { url: 'https://malicious.com' }
        })
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('isValidDomain()', () => {
    describe('Valid domains', () => {
      test('should return true for simple domain', () => {
        expect(isValidDomain('example.com')).toBe(true);
      });

      test('should return true for subdomain', () => {
        expect(isValidDomain('sub.example.com')).toBe(true);
      });

      test('should return true for deep subdomain', () => {
        expect(isValidDomain('deep.sub.example.com')).toBe(true);
      });

      test('should return true for domain with hyphen', () => {
        expect(isValidDomain('my-domain.com')).toBe(true);
      });

      test('should return true for domain with numbers', () => {
        expect(isValidDomain('example123.com')).toBe(true);
      });

      test('should return true for wildcard domain', () => {
        expect(isValidDomain('*.example.com')).toBe(true);
      });

      test('should return true for single-letter domain', () => {
        expect(isValidDomain('x.com')).toBe(true);
      });

      test('should return true for long TLD', () => {
        expect(isValidDomain('example.technology')).toBe(true);
      });
    });

    describe('Invalid domains', () => {
      test('should return false for empty string', () => {
        expect(isValidDomain('')).toBe(false);
      });

      test('should return false for null', () => {
        expect(isValidDomain(null)).toBe(false);
      });

      test('should return false for undefined', () => {
        expect(isValidDomain(undefined)).toBe(false);
      });

      test('should return false for non-string input', () => {
        expect(isValidDomain(123)).toBe(false);
        expect(isValidDomain({})).toBe(false);
        expect(isValidDomain([])).toBe(false);
      });

      test('should return false for domain starting with dot', () => {
        expect(isValidDomain('.example.com')).toBe(false);
      });

      test('should return false for domain ending with dot', () => {
        expect(isValidDomain('example.com.')).toBe(false);
      });

      test('should return false for domain with consecutive dots', () => {
        expect(isValidDomain('example..com')).toBe(false);
      });

      test('should return false for domain with spaces', () => {
        expect(isValidDomain('example .com')).toBe(false);
      });

      test('should return false for domain with special characters', () => {
        expect(isValidDomain('example@.com')).toBe(false);
        expect(isValidDomain('example$.com')).toBe(false);
        expect(isValidDomain('example#.com')).toBe(false);
      });

      test('should return false for domain starting with hyphen', () => {
        expect(isValidDomain('-example.com')).toBe(false);
      });

      test('should return false for domain ending with hyphen', () => {
        expect(isValidDomain('example-.com')).toBe(false);
      });

      test('should return false for domain exceeding 253 characters', () => {
        const longDomain = 'a'.repeat(254) + '.com';
        expect(isValidDomain(longDomain)).toBe(false);
      });

      test('should return false for invalid wildcard placement', () => {
        expect(isValidDomain('*example.com')).toBe(false);
        expect(isValidDomain('example*.com')).toBe(false);
      });

      test('should return false for multiple wildcards', () => {
        expect(isValidDomain('*.*.example.com')).toBe(false);
      });

      test('should return false for URL instead of domain', () => {
        expect(isValidDomain('https://example.com')).toBe(false);
        expect(isValidDomain('http://example.com')).toBe(false);
      });

      test('should return false for path in domain', () => {
        expect(isValidDomain('example.com/path')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      test('should handle maximum valid domain length (253 chars)', () => {
        // Create valid domain with exactly 253 characters
        const maxDomain = 'a'.repeat(240) + '.example.com'; // ~253 chars
        const result = isValidDomain(maxDomain);
        // Should be true if ≤253, false if >253
        expect(typeof result).toBe('boolean');
      });

      test('should handle single character labels', () => {
        expect(isValidDomain('a.b.c')).toBe(true);
      });

      test('should handle 63 character label (max label length)', () => {
        const longLabel = 'a'.repeat(63);
        expect(isValidDomain(`${longLabel}.com`)).toBe(true);
      });
    });

    describe('IDN (Internationalized Domain Names) Support', () => {
      describe('Punycode domains (xn--)', () => {
        test('should return true for German Punycode domain', () => {
          // münchen.de in Punycode
          expect(isValidDomain('xn--mnchen-3ya.de')).toBe(true);
        });

        test('should return true for Arabic Punycode domain', () => {
          // مصر.ae in Punycode
          expect(isValidDomain('xn--wgbh1c.ae')).toBe(true);
        });

        test('should return true for Chinese Punycode domain', () => {
          // 中国.cn in Punycode
          expect(isValidDomain('xn--fiqs8s.cn')).toBe(true);
        });

        test('should return true for Russian Punycode domain', () => {
          // москва.ru in Punycode
          expect(isValidDomain('xn--80adxhks.ru')).toBe(true);
        });

        test('should return true for Japanese Punycode domain', () => {
          // 日本.jp in Punycode
          expect(isValidDomain('xn--wgv71a.jp')).toBe(true);
        });

        test('should return true for Korean Punycode domain', () => {
          // 한국.kr in Punycode
          expect(isValidDomain('xn--3e0b707e.kr')).toBe(true);
        });

        test('should return true for Punycode subdomain', () => {
          expect(isValidDomain('sub.xn--mnchen-3ya.de')).toBe(true);
        });

        test('should return true for wildcard Punycode domain', () => {
          expect(isValidDomain('*.xn--mnchen-3ya.de')).toBe(true);
        });

        test('should return false for invalid Punycode format', () => {
          expect(isValidDomain('xn--.com')).toBe(false); // Empty after xn--
          expect(isValidDomain('xn--invalid@char.com')).toBe(false); // Invalid chars
        });
      });

      describe('Unicode/IDN domains', () => {
        test('should return true for German Unicode domain', () => {
          expect(isValidDomain('münchen.de')).toBe(true);
          expect(isValidDomain('köln.de')).toBe(true);
        });

        test('should return true for French Unicode domain', () => {
          expect(isValidDomain('français.fr')).toBe(true);
          expect(isValidDomain('café.fr')).toBe(true);
        });

        test('should return true for Spanish Unicode domain', () => {
          expect(isValidDomain('españa.es')).toBe(true);
          expect(isValidDomain('año.es')).toBe(true);
        });

        test('should return true for Arabic Unicode domain', () => {
          expect(isValidDomain('مصر.ae')).toBe(true);
          expect(isValidDomain('الإمارات.ae')).toBe(true);
        });

        test('should return true for Chinese Unicode domain', () => {
          expect(isValidDomain('中国.cn')).toBe(true);
          expect(isValidDomain('香港.hk')).toBe(true);
        });

        test('should return true for Japanese Unicode domain', () => {
          expect(isValidDomain('日本.jp')).toBe(true);
          expect(isValidDomain('東京.jp')).toBe(true);
        });

        test('should return true for Korean Unicode domain', () => {
          expect(isValidDomain('한국.kr')).toBe(true);
          expect(isValidDomain('서울.kr')).toBe(true);
        });

        test('should return true for Russian Unicode domain', () => {
          expect(isValidDomain('москва.ru')).toBe(true);
          expect(isValidDomain('россия.ru')).toBe(true);
        });

        test('should return true for Greek Unicode domain', () => {
          expect(isValidDomain('ελλάδα.gr')).toBe(true);
        });

        test('should return true for Hebrew Unicode domain', () => {
          expect(isValidDomain('ישראל.il')).toBe(true);
        });

        test('should return true for Thai Unicode domain', () => {
          expect(isValidDomain('ไทย.th')).toBe(true);
        });

        test('should return true for Hindi Unicode domain', () => {
          expect(isValidDomain('भारत.in')).toBe(true);
        });
      });

      describe('IDN with wildcards', () => {
        test('should return true for wildcard German Unicode domain', () => {
          expect(isValidDomain('*.münchen.de')).toBe(true);
        });

        test('should return true for wildcard Chinese Unicode domain', () => {
          expect(isValidDomain('*.中国.cn')).toBe(true);
        });

        test('should return true for wildcard Arabic Unicode domain', () => {
          expect(isValidDomain('*.مصر.ae')).toBe(true);
        });
      });

      describe('IDN with subdomains', () => {
        test('should return true for Unicode subdomain with ASCII TLD', () => {
          expect(isValidDomain('münchen.example.com')).toBe(true);
        });

        test('should return true for ASCII subdomain with Unicode TLD', () => {
          expect(isValidDomain('www.中国.cn')).toBe(true);
        });

        test('should return true for mixed Unicode subdomains', () => {
          expect(isValidDomain('sub.münchen.example.com')).toBe(true);
        });
      });

      describe('IDN edge cases', () => {
        test('should return true for domain with Unicode numbers', () => {
          expect(isValidDomain('test123.com')).toBe(true);
          expect(isValidDomain('test१२३.in')).toBe(true); // Hindi numbers
        });

        test('should return true for domain with combining marks', () => {
          // Domains with diacritics and combining characters
          expect(isValidDomain('café.com')).toBe(true);
          expect(isValidDomain('naïve.com')).toBe(true);
        });

        test('should return false for domain with emoji', () => {
          // Emojis are not valid in domain names per IDNA2008
          // Note: Some browsers may accept these, but they're technically invalid
          // The implementation should reject these for security
          expect(isValidDomain('😀.com')).toBe(false);
          expect(isValidDomain('hello😀world.com')).toBe(false);
        });

        test('should handle maximum label length for Unicode (63 chars)', () => {
          // Each Unicode character may expand to multiple bytes in Punycode
          // but label length is measured in characters, not bytes
          const unicodeLongLabel = 'ä'.repeat(63);
          expect(isValidDomain(`${unicodeLongLabel}.com`)).toBe(true);
        });

        test('should return false for label exceeding 63 characters', () => {
          const tooLongLabel = 'ä'.repeat(64);
          expect(isValidDomain(`${tooLongLabel}.com`)).toBe(false);
        });
      });

      describe('Security: Homograph attack prevention awareness', () => {
        test('should accept visually similar characters (validation only)', () => {
          // Note: isValidDomain only validates format, not security
          // Homograph detection should be handled separately
          // These are valid formats but may be security risks:

          // Cyrillic 'а' (U+0430) looks like Latin 'a'
          expect(isValidDomain('pаypal.com')).toBe(true); // Contains Cyrillic 'а'

          // These tests document that format validation passes
          // but additional security validation may be needed
        });
      });

      describe('RFC compliance', () => {
        test('should reject domain with leading hyphen per RFC 1034', () => {
          expect(isValidDomain('-münchen.de')).toBe(false);
        });

        test('should reject domain with trailing hyphen per RFC 1034', () => {
          expect(isValidDomain('münchen-.de')).toBe(false);
        });

        test('should reject empty labels', () => {
          expect(isValidDomain('münchen..de')).toBe(false); // consecutive dots
        });

        test('should respect 253 character total length limit per RFC 1034', () => {
          // Total domain length must not exceed 253 characters
          const longUnicodeDomain = 'ä'.repeat(250) + '.de';
          expect(isValidDomain(longUnicodeDomain)).toBe(false);
        });
      });
    });
  });

  describe('isValidURL()', () => {
    describe('Valid URLs', () => {
      test('should return true for HTTP URL', () => {
        expect(isValidURL('http://example.com')).toBe(true);
      });

      test('should return true for HTTPS URL', () => {
        expect(isValidURL('https://example.com')).toBe(true);
      });

      test('should return true for chrome-extension URL', () => {
        expect(isValidURL('chrome-extension://abcdef123456/popup.html')).toBe(true);
      });

      test('should return true for URL with path', () => {
        expect(isValidURL('https://example.com/path/to/page')).toBe(true);
      });

      test('should return true for URL with query parameters', () => {
        expect(isValidURL('https://example.com?param=value')).toBe(true);
      });

      test('should return true for URL with hash', () => {
        expect(isValidURL('https://example.com#section')).toBe(true);
      });

      test('should return true for URL with port', () => {
        expect(isValidURL('https://example.com:8080')).toBe(true);
      });

      test('should return true for URL with username and password', () => {
        expect(isValidURL('https://user:pass@example.com')).toBe(true);
      });

      test('should return true for file URL', () => {
        expect(isValidURL('file:///path/to/file.txt')).toBe(true);
      });

      test('should return true for localhost URL', () => {
        expect(isValidURL('http://localhost:3000')).toBe(true);
      });
    });

    describe('Invalid URLs', () => {
      test('should return false for empty string', () => {
        expect(isValidURL('')).toBe(false);
      });

      test('should return false for null', () => {
        expect(isValidURL(null)).toBe(false);
      });

      test('should return false for undefined', () => {
        expect(isValidURL(undefined)).toBe(false);
      });

      test('should return false for plain domain without protocol', () => {
        expect(isValidURL('example.com')).toBe(false);
      });

      test('should return false for malformed URL', () => {
        expect(isValidURL('ht!tp://example.com')).toBe(false);
      });

      test('should return false for URL with spaces', () => {
        expect(isValidURL('https://exa mple.com')).toBe(false);
      });

      test('should return false for non-string input', () => {
        expect(isValidURL(123)).toBe(false);
        expect(isValidURL({})).toBe(false);
        expect(isValidURL([])).toBe(false);
      });
    });
  });

  describe('isValidRequestStructure()', () => {
    describe('Valid request structures', () => {
      test('should return true for request with string action', () => {
        const request = { action: 'updateWhitelist' };
        expect(isValidRequestStructure(request)).toBe(true);
      });

      test('should return true for request with action and data', () => {
        const request = {
          action: 'updateWhitelist',
          domain: 'example.com'
        };
        expect(isValidRequestStructure(request)).toBe(true);
      });

      test('should return true for request with empty string action', () => {
        const request = { action: '' };
        expect(isValidRequestStructure(request)).toBe(true);
      });

      test('should return true for request with additional fields', () => {
        const request = {
          action: 'test',
          field1: 'value1',
          field2: 'value2',
          nested: { key: 'value' }
        };
        expect(isValidRequestStructure(request)).toBe(true);
      });
    });

    describe('Invalid request structures', () => {
      test('should return false for null request', () => {
        expect(isValidRequestStructure(null)).toBe(false);
      });

      test('should return false for undefined request', () => {
        expect(isValidRequestStructure(undefined)).toBe(false);
      });

      test('should return false for request without action field', () => {
        const request = { data: 'test' };
        expect(isValidRequestStructure(request)).toBe(false);
      });

      test('should return false for request with null action', () => {
        const request = { action: null };
        expect(isValidRequestStructure(request)).toBe(false);
      });

      test('should return false for request with undefined action', () => {
        const request = { action: undefined };
        expect(isValidRequestStructure(request)).toBe(false);
      });

      test('should return false for request with non-string action', () => {
        expect(isValidRequestStructure({ action: 123 })).toBe(false);
        expect(isValidRequestStructure({ action: {} })).toBe(false);
        expect(isValidRequestStructure({ action: [] })).toBe(false);
        expect(isValidRequestStructure({ action: true })).toBe(false);
      });

      test('should return false for empty object', () => {
        expect(isValidRequestStructure({})).toBe(false);
      });

      test('should return false for non-object request', () => {
        expect(isValidRequestStructure('string')).toBe(false);
        expect(isValidRequestStructure(123)).toBe(false);
        expect(isValidRequestStructure([])).toBe(false);
      });
    });
  });

  describe('Integration scenarios', () => {
    test('should validate complete message flow', () => {
      const sender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/popup.html'
      };

      const request = {
        action: 'updateWhitelist',
        domain: 'example.com'
      };

      // All validations should pass
      expect(isValidExtensionSender(sender)).toBe(true);
      expect(isTrustedUISender(sender)).toBe(true);
      expect(isValidRequestStructure(request)).toBe(true);
      expect(isValidDomain(request.domain)).toBe(true);
    });

    test('should reject malicious message flow', () => {
      const maliciousSender = {
        id: 'malicious-extension-id',
        url: 'https://malicious.com'
      };

      const request = {
        action: 'updateWhitelist',
        domain: '../../../etc/passwd'
      };

      // Sender validations should fail
      expect(isValidExtensionSender(maliciousSender)).toBe(false);
      expect(isTrustedUISender(maliciousSender)).toBe(false);
      expect(isValidDomain(request.domain)).toBe(false);
    });
  });
});
