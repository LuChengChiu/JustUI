/**
 * Unit Tests for Simplified SecurityValidator Module
 * Tests URL validation and threat analysis without unicode regex issues
 */

import { SecurityValidator } from '@modules/navigation-guardian/SecurityValidator.simple.js';

describe('Simplified SecurityValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new SecurityValidator();
  });

  describe('URL Validation', () => {
    test('should validate safe HTTPS URLs', () => {
      const result = validator.validateURL('https://google.com/search');
      
      expect(result.isValid).toBe(true);
      expect(result.displayURL).toBe('https://google.com/search');
      expect(result.warnings).toEqual([]);
    });

    test('should block javascript protocol', () => {
      const result = validator.validateURL('javascript:alert("test")');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toContain('Blocked: Unsafe protocol (javascript:)');
      expect(result.warnings).toContain('Unsafe protocol: javascript:');
    });

    test('should block data protocol', () => {
      const result = validator.validateURL('data:text/html,<script>alert(1)</script>');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toContain('Blocked: Unsafe protocol (data:)');
      expect(result.warnings).toContain('Unsafe protocol: data:');
    });

    test('should handle null/undefined URLs', () => {
      expect(validator.validateURL(null).isValid).toBe(false);
      expect(validator.validateURL(undefined).isValid).toBe(false);
      expect(validator.validateURL('').isValid).toBe(false);
    });
  });

  describe('Unicode Detection', () => {
    test('should detect cyrillic characters using character codes', () => {
      // Create cyrillic domain using char codes
      const cyrillicDomain = String.fromCharCode(0x0433, 0x043e, 0x043e, 0x0433, 0x043be) + '.com';
      const result = validator.containsSuspiciousUnicode(cyrillicDomain);
      
      expect(result).toBe(true);
    });

    test('should detect greek characters', () => {
      const greekDomain = 'g' + String.fromCharCode(0x03bf, 0x03bf) + 'gle.com';
      const result = validator.containsSuspiciousUnicode(greekDomain);
      
      expect(result).toBe(true);
    });

    test('should allow safe latin characters', () => {
      const result = validator.containsSuspiciousUnicode('google.com');
      
      expect(result).toBe(false);
    });

    test('should handle null/empty hostnames', () => {
      expect(validator.containsSuspiciousUnicode(null)).toBe(false);
      expect(validator.containsSuspiciousUnicode('')).toBe(false);
      expect(validator.containsSuspiciousUnicode(123)).toBe(false);
    });
  });

  describe('Homograph Attack Detection', () => {
    test('should block cyrillic domain in URL validation', () => {
      const cyrillicDomain = 'https://' + String.fromCharCode(0x0433, 0x043e, 0x043e, 0x0433, 0x043be) + '.com';
      const result = validator.validateURL(cyrillicDomain);
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toBe('Blocked: Suspicious characters in domain');
      expect(result.warnings).toContain('Potential homograph attack detected');
    });
  });

  describe('Threat Analysis', () => {
    test('should analyze safe URLs with low risk', () => {
      const analysis = validator.analyzeThreats('https://google.com/search');
      
      expect(analysis.riskScore).toBeLessThan(4);
      expect(analysis.threats).toEqual([]);
      expect(analysis.isPopUnder).toBe(false);
    });

    test('should detect known malicious domains', () => {
      const analysis = validator.analyzeThreats('https://adexchangeclear.com/malware');
      
      expect(analysis.riskScore).toBeGreaterThanOrEqual(8);
      expect(analysis.threats.length).toBeGreaterThan(0);
      expect(analysis.threats[0].type).toBe('Known malicious ad network');
      expect(analysis.isPopUnder).toBe(true);
    });

    test('should detect suspicious tracking parameters', () => {
      const analysis = validator.analyzeThreats('https://example.com/page.php?param_4=123&param_5=456');
      
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.threats.some(t => t.type.includes('param_4'))).toBe(true);
      expect(analysis.threats.some(t => t.type.includes('param_5'))).toBe(true);
    });

    test('should handle null/undefined input gracefully', () => {
      const nullAnalysis = validator.analyzeThreats(null);
      expect(nullAnalysis.riskScore).toBe(2);
      expect(nullAnalysis.threats[0].type).toBe('Invalid URL input');
    });
  });

  describe('Comprehensive Security Analysis', () => {
    test('should provide complete analysis for safe URLs', () => {
      const analysis = validator.getSecurityAnalysis('https://google.com/search');
      
      expect(analysis.validation.isValid).toBe(true);
      expect(analysis.threatAnalysis.riskScore).toBeLessThan(4);
      expect(analysis.threatLevel.level).toBe('LOW');
      expect(analysis.recommendation).toBe('ALLOW');
    });

    test('should provide complete analysis for malicious URLs', () => {
      const analysis = validator.getSecurityAnalysis('https://adexchangeclear.com/malware');
      
      expect(analysis.validation.isValid).toBe(true); // Valid URL structure
      expect(analysis.threatAnalysis.riskScore).toBeGreaterThanOrEqual(8);
      expect(analysis.threatLevel.level).toBe('HIGH');
      expect(analysis.recommendation).toBe('BLOCK');
    });

    test('should provide complete analysis for invalid URLs', () => {
      const analysis = validator.getSecurityAnalysis('javascript:alert("xss")');
      
      expect(analysis.validation.isValid).toBe(false);
      expect(analysis.recommendation).toBe('BLOCK');
    });
  });

  describe('Performance', () => {
    test('should handle multiple URL validations efficiently', () => {
      const urls = [
        'https://google.com',
        'https://github.com',
        'https://stackoverflow.com',
        'javascript:alert("test")',
        'data:text/html,test'
      ];
      
      const start = performance.now();
      urls.forEach(url => {
        validator.validateURL(url);
        validator.analyzeThreats(url);
      });
      const end = performance.now();
      
      // Should complete 10 operations (5 validate + 5 analyze) quickly
      expect(end - start).toBeLessThan(100);
    });
  });
});
