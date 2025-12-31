/**
 * Unit Tests for MaliciousPatternDetector Module
 * Tests pattern detection for pop-under and malicious script analysis
 */

import { MaliciousPatternDetector } from '@script-utils/malicious-pattern-detector.js';

describe('MaliciousPatternDetector', () => {

  describe('analyze() - Critical Signatures Detection', () => {
    test('should detect explicit pop-under function declaration (arrow function)', () => {
      const code = `const triggerPopUnder = () => { window.open('http://example.com', '_blank'); }`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.isMalicious).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(10);
      expect(result.threats).toContain('Explicit pop-under function declaration');
    });

    test('should detect explicit pop-under function declaration (regular function)', () => {
      const code = `var triggerPopUnder = function() { window.open('http://example.com', '_blank'); }`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.isMalicious).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(10);
    });

    test('should detect pop-under rate limiting mechanism', () => {
      const code = `const e = parseInt(localStorage.getItem('lastPopUnderTime'));`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.isMalicious).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(9);
      expect(result.threats).toContain('Pop-under rate limiting mechanism');
    });

    test('should detect window.open with focus manipulation', () => {
      const code = `window.open('http://ad.com', '_blank'); window.focus();`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.isMalicious).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(9);
      expect(result.threats).toContain('Pop-under with focus manipulation');
    });
  });

  describe('analyze() - High Risk Patterns Detection', () => {
    test('should detect single-use click hijacking listener', () => {
      const code = `document.addEventListener('click', handler, { once: true });`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.riskScore).toBeGreaterThanOrEqual(7);
      expect(result.threats).toContain('Single-use click hijacking listener');
    });

    test('should detect single-use click hijacking with minified boolean', () => {
      const code = `document.addEventListener('click', handler, { once: !0 });`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.riskScore).toBeGreaterThanOrEqual(7);
    });

    test('should detect generateClickId function declaration', () => {
      const code = `const generateClickId = () => Math.random().toString(36);`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.riskScore).toBeGreaterThanOrEqual(6);
      expect(result.threats).toContain('Click tracking ID generation function');
    });

    test('should detect DELAY_IN_MILLISECONDS constant', () => {
      const code = `const DELAY_IN_MILLISECONDS = 5000;`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.riskScore).toBeGreaterThanOrEqual(6);
      expect(result.threats).toContain('Pop-under timing delay constant');
    });
  });

  describe('analyze() - Medium Risk Patterns Detection', () => {
    test('should detect malicious PHP tracking parameters', () => {
      const code = `const url = 'https://tracker.com/click.php?param_4=123';`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.riskScore).toBeGreaterThanOrEqual(5);
      expect(result.threats).toContain('Malicious PHP tracking parameters');
    });

    test('should detect known pop-under ad networks', () => {
      const networks = ['pubfuture-ad.com', 'clickadu.com', 'propellerads.com', 'popcash.com'];

      networks.forEach(network => {
        const code = `const adUrl = 'https://${network}/ad';`;
        const result = MaliciousPatternDetector.analyze(code);

        expect(result.riskScore).toBeGreaterThanOrEqual(5);
        expect(result.threats).toContain('Known pop-under ad network');
      });
    });
  });

  describe('analyze() - False Positive Prevention', () => {
    test('should NOT flag variable names containing triggerPopUnder', () => {
      const code = `const triggerPopUnderButton = document.getElementById('btn');`;
      const result = MaliciousPatternDetector.analyze(code);

      // Should not match because pattern requires function declaration syntax
      expect(result.threats).not.toContain('Explicit pop-under function declaration');
    });

    test('should NOT flag comments mentioning triggerPopUnder', () => {
      const code = `// Don't use triggerPopUnder function in production`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.isMalicious).toBe(false);
    });

    test('should NOT flag legitimate window.open usage', () => {
      const code = `window.open('https://docs.google.com/document', '_blank');`;
      const result = MaliciousPatternDetector.analyze(code);

      // Missing window.focus() so should not match pop-under pattern
      expect(result.threats).not.toContain('Pop-under with focus manipulation');
    });

    test('should NOT flag legitimate addEventListener usage', () => {
      const code = `document.addEventListener('click', handleClick);`;
      const result = MaliciousPatternDetector.analyze(code);

      // Missing { once: true } so should not match
      expect(result.threats).not.toContain('Single-use click hijacking listener');
    });

    test('should NOT flag legitimate localStorage usage', () => {
      const code = `const lastVisit = localStorage.getItem('lastVisitDate');`;
      const result = MaliciousPatternDetector.analyze(code);

      expect(result.isMalicious).toBe(false);
    });

    test('should NOT flag legitimate delay constants', () => {
      const code = `const ANIMATION_DELAY_IN_MILLISECONDS = 300;`;
      const result = MaliciousPatternDetector.analyze(code);

      // Pattern requires exact "DELAY_IN_MILLISECONDS" at start of constant name
      expect(result.threats).not.toContain('Pop-under timing delay constant');
    });
  });

  describe('analyze() - Edge Cases', () => {
    test('should handle null input', () => {
      const result = MaliciousPatternDetector.analyze(null);

      expect(result.isMalicious).toBe(false);
      expect(result.riskScore).toBe(0);
      expect(result.threats).toEqual([]);
    });

    test('should handle undefined input', () => {
      const result = MaliciousPatternDetector.analyze(undefined);

      expect(result.isMalicious).toBe(false);
      expect(result.riskScore).toBe(0);
    });

    test('should handle empty string', () => {
      const result = MaliciousPatternDetector.analyze('');

      expect(result.isMalicious).toBe(false);
      expect(result.riskScore).toBe(0);
    });

    test('should handle non-string input', () => {
      const result = MaliciousPatternDetector.analyze(12345);

      expect(result.isMalicious).toBe(false);
      expect(result.riskScore).toBe(0);
    });

    test('should respect custom threshold parameter', () => {
      const code = `const url = 'https://clickadu.com/ad';`; // Score: 5

      const defaultResult = MaliciousPatternDetector.analyze(code, 6);
      expect(defaultResult.isMalicious).toBe(false); // 5 < 6

      const lowerThreshold = MaliciousPatternDetector.analyze(code, 5);
      expect(lowerThreshold.isMalicious).toBe(true); // 5 >= 5
    });
  });

  describe('analyze() - Combined Patterns', () => {
    test('should accumulate risk score from multiple patterns', () => {
      const code = `
        const triggerPopUnder = () => {
          const DELAY_IN_MILLISECONDS = 5000;
          window.open('https://clickadu.com/ad', '_blank');
          window.focus();
        };
      `;
      const result = MaliciousPatternDetector.analyze(code);

      // Should match multiple patterns
      expect(result.isMalicious).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(20); // Multiple patterns
      expect(result.threats.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('isUrlMalicious()', () => {
    test('should detect known malicious domains', () => {
      const maliciousUrls = [
        'https://pubfuture-ad.com/click',
        'https://clickadu.com/ad',
        'https://propellerads.com/serve',
        'https://popcash.net/redirect'
      ];

      maliciousUrls.forEach(url => {
        expect(MaliciousPatternDetector.isUrlMalicious(url)).toBe(true);
      });
    });

    test('should detect tracking PHP parameters', () => {
      expect(MaliciousPatternDetector.isUrlMalicious('https://example.com/track.php?param_4=abc')).toBe(true);
      expect(MaliciousPatternDetector.isUrlMalicious('https://example.com/track.php?param_5=xyz')).toBe(true);
    });

    test('should detect popunder in URL', () => {
      expect(MaliciousPatternDetector.isUrlMalicious('https://example.com/popunder/ad')).toBe(true);
    });

    test('should NOT flag legitimate URLs', () => {
      const legitimateUrls = [
        'https://google.com',
        'https://github.com',
        'https://stackoverflow.com',
        'https://developer.mozilla.org',
        'https://example.com/api/v4/users', // param_4 not in PHP context
        'https://docs.google.com/document'
      ];

      legitimateUrls.forEach(url => {
        expect(MaliciousPatternDetector.isUrlMalicious(url)).toBe(false);
      });
    });

    test('should handle null/undefined/empty input', () => {
      expect(MaliciousPatternDetector.isUrlMalicious(null)).toBe(false);
      expect(MaliciousPatternDetector.isUrlMalicious(undefined)).toBe(false);
      expect(MaliciousPatternDetector.isUrlMalicious('')).toBe(false);
    });

    test('should handle non-string input', () => {
      expect(MaliciousPatternDetector.isUrlMalicious(12345)).toBe(false);
      expect(MaliciousPatternDetector.isUrlMalicious({ url: 'test' })).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should analyze code efficiently', () => {
      const code = `
        const triggerPopUnder = () => {
          window.open('https://example.com', '_blank');
          window.focus();
        };
      `;

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        MaliciousPatternDetector.analyze(code);
      }
      const end = performance.now();

      // 100 analyses should complete in less than 100ms
      expect(end - start).toBeLessThan(100);
    });

    test('should check URLs efficiently', () => {
      const urls = [
        'https://google.com',
        'https://clickadu.com/ad',
        'https://github.com',
        'https://example.com/track.php?param_4=test'
      ];

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        urls.forEach(url => MaliciousPatternDetector.isUrlMalicious(url));
      }
      const end = performance.now();

      // 400 URL checks should complete in less than 50ms
      expect(end - start).toBeLessThan(50);
    });
  });
});
