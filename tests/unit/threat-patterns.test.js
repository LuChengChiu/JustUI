/**
 * Unit Tests for Shared Threat Patterns Module
 * Tests shared pattern definitions, helpers, and exports
 */

import { describe, test, expect } from 'vitest';
import {
  AD_NETWORK_DOMAINS,
  TRACKING_PARAMETERS,
  SPECIAL_URLS,
  SPECIAL_URLS_PATTERN,
  URL_THREAT_PATTERNS,
  THREAT_SCORES,
  getAdNetworkScore,
  findTrackingParams,
  isSpecialUrl,
  isSpecialUrlExact,
} from '@script-utils/threat-patterns.js';

describe('ThreatPatterns - Exports', () => {
  describe('AD_NETWORK_DOMAINS', () => {
    test('should export all known ad networks', () => {
      expect(AD_NETWORK_DOMAINS).toBeDefined();
      expect(Array.isArray(AD_NETWORK_DOMAINS)).toBe(true);
      expect(AD_NETWORK_DOMAINS.length).toBeGreaterThan(0);
    });

    test('should include known malicious domains', () => {
      expect(AD_NETWORK_DOMAINS).toContain('pubfuture-ad.com');
      expect(AD_NETWORK_DOMAINS).toContain('clickadu.com');
      expect(AD_NETWORK_DOMAINS).toContain('propellerads.com');
      expect(AD_NETWORK_DOMAINS).toContain('popcash.com');
      expect(AD_NETWORK_DOMAINS).toContain('popcash.net');
      expect(AD_NETWORK_DOMAINS).toContain('adexchangeclear.com');
    });
  });

  describe('TRACKING_PARAMETERS', () => {
    test('should export tracking parameters array', () => {
      expect(TRACKING_PARAMETERS).toBeDefined();
      expect(Array.isArray(TRACKING_PARAMETERS)).toBe(true);
      expect(TRACKING_PARAMETERS.length).toBeGreaterThan(0);
    });

    test('should include common tracking parameters', () => {
      expect(TRACKING_PARAMETERS).toContain('param_4');
      expect(TRACKING_PARAMETERS).toContain('param_5');
      expect(TRACKING_PARAMETERS).toContain('clickid');
      expect(TRACKING_PARAMETERS).toContain('adclick');
      expect(TRACKING_PARAMETERS).toContain('redirect');
    });
  });

  describe('SPECIAL_URLS', () => {
    test('should export special URLs array', () => {
      expect(SPECIAL_URLS).toBeDefined();
      expect(Array.isArray(SPECIAL_URLS)).toBe(true);
    });

    test('should include about:blank', () => {
      expect(SPECIAL_URLS).toContain('about:blank');
    });
  });

  describe('SPECIAL_URLS_PATTERN', () => {
    test('should export compiled regex pattern', () => {
      expect(SPECIAL_URLS_PATTERN).toBeDefined();
      expect(SPECIAL_URLS_PATTERN).toBeInstanceOf(RegExp);
    });

    test('should match about:blank', () => {
      expect(SPECIAL_URLS_PATTERN.test('about:blank')).toBe(true);
    });

    test('should be case-insensitive', () => {
      expect(SPECIAL_URLS_PATTERN.test('ABOUT:BLANK')).toBe(true);
      expect(SPECIAL_URLS_PATTERN.test('About:Blank')).toBe(true);
    });

    test('should NOT match non-special URLs', () => {
      expect(SPECIAL_URLS_PATTERN.test('https://example.com')).toBe(false);
      expect(SPECIAL_URLS_PATTERN.test('https://about:blank.com')).toBe(false);
    });
  });

  describe('URL_THREAT_PATTERNS', () => {
    test('should export compiled regex patterns', () => {
      expect(URL_THREAT_PATTERNS).toBeDefined();
      expect(URL_THREAT_PATTERNS.phpTracking).toBeInstanceOf(RegExp);
      expect(URL_THREAT_PATTERNS.adNetworks).toBeInstanceOf(RegExp);
      expect(URL_THREAT_PATTERNS.popUnderKeyword).toBeInstanceOf(RegExp);
    });
  });

  describe('THREAT_SCORES', () => {
    test('should export threat scores object', () => {
      expect(THREAT_SCORES).toBeDefined();
      expect(typeof THREAT_SCORES).toBe('object');
    });

    test('should define all required scores', () => {
      expect(THREAT_SCORES.adexchangeclear).toBe(8);
      expect(THREAT_SCORES.genericAdNetwork).toBe(5);
      expect(THREAT_SCORES.trackingParam).toBe(3);
      expect(THREAT_SCORES.phpTracking).toBe(6);
      expect(THREAT_SCORES.aboutBlank).toBe(5);
      expect(THREAT_SCORES.popUnderKeyword).toBe(4);
    });
  });
});

describe('URL_THREAT_PATTERNS - Pattern Matching', () => {
  describe('phpTracking pattern', () => {
    test('should match .php?param_4=xxx URLs', () => {
      expect(URL_THREAT_PATTERNS.phpTracking.test('click.php?param_4=123')).toBe(true);
      expect(URL_THREAT_PATTERNS.phpTracking.test('track.php?param_4=abc')).toBe(true);
      expect(URL_THREAT_PATTERNS.phpTracking.test('https://example.com/track.php?param_4=xyz')).toBe(true);
    });

    test('should match .php?param_5=xxx URLs', () => {
      expect(URL_THREAT_PATTERNS.phpTracking.test('click.php?param_5=456')).toBe(true);
      expect(URL_THREAT_PATTERNS.phpTracking.test('https://example.com/track.php?param_5=def')).toBe(true);
    });

    test('should NOT match non-PHP or different params', () => {
      expect(URL_THREAT_PATTERNS.phpTracking.test('api.js?param_4=123')).toBe(false);
      expect(URL_THREAT_PATTERNS.phpTracking.test('click.php?user=123')).toBe(false);
      expect(URL_THREAT_PATTERNS.phpTracking.test('click.php?param_3=123')).toBe(false);
    });
  });

  describe('adNetworks pattern', () => {
    test('should match all ad network domains', () => {
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://clickadu.com/ad')).toBe(true);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://pubfuture-ad.com/track')).toBe(true);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://propellerads.com/popup')).toBe(true);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://popcash.com/ad')).toBe(true);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://popcash.net/ad')).toBe(true);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://adexchangeclear.com/malware')).toBe(true);
    });

    test('should NOT match legitimate domains', () => {
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://google.com')).toBe(false);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://github.com')).toBe(false);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://stackoverflow.com')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://CLICKADU.COM/ad')).toBe(true);
      expect(URL_THREAT_PATTERNS.adNetworks.test('https://ClickAdu.Com/ad')).toBe(true);
    });
  });

  describe('popUnderKeyword pattern', () => {
    test('should match URLs containing "popunder"', () => {
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://example.com/popunder')).toBe(true);
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://popunder.example.com')).toBe(true);
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://example.com?type=popunder')).toBe(true);
    });

    test('should be case-insensitive', () => {
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://example.com/POPUNDER')).toBe(true);
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://example.com/PopUnder')).toBe(true);
    });

    test('should NOT match URLs without popunder', () => {
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://example.com/popup')).toBe(false);
      expect(URL_THREAT_PATTERNS.popUnderKeyword.test('https://google.com')).toBe(false);
    });
  });
});

describe('getAdNetworkScore() - Helper Function', () => {
  test('should return 8 for adexchangeclear.com', () => {
    expect(getAdNetworkScore('https://adexchangeclear.com/ad')).toBe(8);
    expect(getAdNetworkScore('adexchangeclear.com')).toBe(8);
    expect(getAdNetworkScore('https://subdomain.adexchangeclear.com/path')).toBe(8);
  });

  test('should return 5 for generic ad networks', () => {
    expect(getAdNetworkScore('https://clickadu.com/ad')).toBe(5);
    expect(getAdNetworkScore('https://pubfuture-ad.com/track')).toBe(5);
    expect(getAdNetworkScore('https://propellerads.com/popup')).toBe(5);
    expect(getAdNetworkScore('https://popcash.com/ad')).toBe(5);
    expect(getAdNetworkScore('https://popcash.net/ad')).toBe(5);
  });

  test('should return 0 for non-ad domains', () => {
    expect(getAdNetworkScore('https://google.com')).toBe(0);
    expect(getAdNetworkScore('https://github.com')).toBe(0);
    expect(getAdNetworkScore('https://stackoverflow.com')).toBe(0);
    expect(getAdNetworkScore('example.com')).toBe(0);
  });

  test('should handle edge cases', () => {
    expect(getAdNetworkScore('')).toBe(0);
    expect(getAdNetworkScore('not-a-url')).toBe(0);
  });
});

describe('findTrackingParams() - Helper Function', () => {
  test('should find param_4 and param_5', () => {
    const url = new URL('https://example.com?param_4=123&param_5=456');
    const found = findTrackingParams(url);

    expect(found).toContain('param_4');
    expect(found).toContain('param_5');
    expect(found.length).toBe(2);
  });

  test('should find clickid and redirect params', () => {
    const url = new URL('https://example.com?clickid=abc&redirect=yes');
    const found = findTrackingParams(url);

    expect(found).toContain('clickid');
    expect(found).toContain('redirect');
    expect(found.length).toBe(2);
  });

  test('should find adclick parameter', () => {
    const url = new URL('https://example.com?adclick=true&user=john');
    const found = findTrackingParams(url);

    expect(found).toContain('adclick');
    expect(found.length).toBe(1);
  });

  test('should find multiple tracking parameters', () => {
    const url = new URL('https://example.com?param_4=1&param_5=2&clickid=3&adclick=4&redirect=5');
    const found = findTrackingParams(url);

    expect(found.length).toBe(5);
    expect(found).toContain('param_4');
    expect(found).toContain('param_5');
    expect(found).toContain('clickid');
    expect(found).toContain('adclick');
    expect(found).toContain('redirect');
  });

  test('should return empty array for clean URLs', () => {
    const url = new URL('https://google.com/search?q=test');
    const found = findTrackingParams(url);

    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBe(0);
  });

  test('should return empty array for URLs without query params', () => {
    const url = new URL('https://example.com/path');
    const found = findTrackingParams(url);

    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBe(0);
  });

  test('should handle case-sensitive parameter names', () => {
    const url = new URL('https://example.com?PARAM_4=123&Param_5=456');
    const found = findTrackingParams(url);

    // Parameter names are case-sensitive in URLSearchParams
    expect(found.length).toBe(0);
  });
});

describe('Integration Tests', () => {
  test('shared patterns should work together', () => {
    const testUrl = 'https://clickadu.com/track.php?param_4=123&clickid=abc';

    // Test pattern matching
    expect(URL_THREAT_PATTERNS.adNetworks.test(testUrl)).toBe(true);
    expect(URL_THREAT_PATTERNS.phpTracking.test(testUrl)).toBe(true);

    // Test helper functions
    expect(getAdNetworkScore(testUrl)).toBe(5);

    const urlObj = new URL(testUrl);
    const params = findTrackingParams(urlObj);
    expect(params).toContain('param_4');
    expect(params).toContain('clickid');
  });

  test('should calculate consistent risk scores', () => {
    const adNetworkScore = getAdNetworkScore('https://clickadu.com/ad');
    const phpTrackingScore = THREAT_SCORES.phpTracking;
    const trackingParamScore = THREAT_SCORES.trackingParam * 2; // 2 params

    const totalScore = adNetworkScore + phpTrackingScore + trackingParamScore;

    expect(totalScore).toBe(5 + 6 + 6); // 17 total
  });
});

describe('isSpecialUrl() - Helper Function', () => {
  test('should return true for about:blank', () => {
    expect(isSpecialUrl('about:blank')).toBe(true);
  });

  test('should be case-insensitive', () => {
    expect(isSpecialUrl('ABOUT:BLANK')).toBe(true);
    expect(isSpecialUrl('About:Blank')).toBe(true);
    expect(isSpecialUrl('aBOUT:bLANK')).toBe(true);
  });

  test('should return false for regular URLs', () => {
    expect(isSpecialUrl('https://example.com')).toBe(false);
    expect(isSpecialUrl('https://google.com')).toBe(false);
    expect(isSpecialUrl('http://localhost:3000')).toBe(false);
  });

  test('should return false for URLs containing about:blank as substring', () => {
    expect(isSpecialUrl('https://about:blank.com')).toBe(false);
    expect(isSpecialUrl('https://example.com/about:blank')).toBe(false);
  });

  test('should handle edge cases', () => {
    expect(isSpecialUrl('')).toBe(false);
    expect(isSpecialUrl(null)).toBe(false);
    expect(isSpecialUrl(undefined)).toBe(false);
    expect(isSpecialUrl(123)).toBe(false);
    expect(isSpecialUrl({})).toBe(false);
  });

  test('should return false for whitespace-padded inputs', () => {
    expect(isSpecialUrl('  about:blank')).toBe(false);
    expect(isSpecialUrl('about:blank  ')).toBe(false);
    expect(isSpecialUrl('  about:blank  ')).toBe(false);
    expect(isSpecialUrl('\tabout:blank')).toBe(false);
    expect(isSpecialUrl('about:blank\n')).toBe(false);
    expect(isSpecialUrl('\nabout:blank\n')).toBe(false);
  });
});

describe('isSpecialUrlExact() - Helper Function', () => {
  test('should return true for exact about:blank match', () => {
    expect(isSpecialUrlExact('about:blank')).toBe(true);
  });

  test('should be case-sensitive (exact match)', () => {
    // Exact match requires exact case
    expect(isSpecialUrlExact('ABOUT:BLANK')).toBe(false);
    expect(isSpecialUrlExact('About:Blank')).toBe(false);
  });

  test('should return false for regular URLs', () => {
    expect(isSpecialUrlExact('https://example.com')).toBe(false);
    expect(isSpecialUrlExact('https://google.com')).toBe(false);
  });

  test('should return false for partial matches', () => {
    expect(isSpecialUrlExact('about:blank?foo=bar')).toBe(false);
    expect(isSpecialUrlExact('about:blank#hash')).toBe(false);
  });

  test('should handle edge cases', () => {
    expect(isSpecialUrlExact('')).toBe(false);
    expect(isSpecialUrlExact(null)).toBe(false);
    expect(isSpecialUrlExact(undefined)).toBe(false);
    expect(isSpecialUrlExact(123)).toBe(false);
    expect(isSpecialUrlExact({})).toBe(false);
  });

  test('should return false for whitespace-padded inputs', () => {
    expect(isSpecialUrlExact('  about:blank')).toBe(false);
    expect(isSpecialUrlExact('about:blank  ')).toBe(false);
    expect(isSpecialUrlExact('  about:blank  ')).toBe(false);
    expect(isSpecialUrlExact('\tabout:blank')).toBe(false);
    expect(isSpecialUrlExact('about:blank\n')).toBe(false);
    expect(isSpecialUrlExact('\nabout:blank\n')).toBe(false);
  });
});

describe('Performance Tests', () => {
  test('pattern matching should be fast', () => {
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      URL_THREAT_PATTERNS.adNetworks.test('https://clickadu.com/ad');
      URL_THREAT_PATTERNS.phpTracking.test('track.php?param_4=123');
      URL_THREAT_PATTERNS.popUnderKeyword.test('https://example.com/popunder');
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // 1000 iterations should complete in < 100ms
    expect(duration).toBeLessThan(100);
  });

  test('helper functions should be efficient', () => {
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      getAdNetworkScore('https://clickadu.com/ad');
      const url = new URL('https://example.com?param_4=1&param_5=2');
      findTrackingParams(url);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // 1000 iterations should complete in < 200ms
    expect(duration).toBeLessThan(200);
  });
});
