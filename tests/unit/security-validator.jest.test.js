/**
 * Jest-based SecurityValidator Tests
 * Testing with Jest to isolate unicode parsing issues
 */

import { SecurityValidator } from '@modules/navigation-guardian/security-validator.js';

describe('SecurityValidator with Jest', () => {
  let validator;

  beforeEach(() => {
    validator = new SecurityValidator();
  });

  describe('Basic URL Validation', () => {
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
    });
  });

  describe('Unicode Detection', () => {
    test('should detect cyrillic characters', () => {
      const cyrillicDomain = String.fromCharCode(0x0433, 0x043e, 0x043e, 0x0433, 0x043be) + '.com';
      const result = validator.containsSuspiciousUnicode(cyrillicDomain);
      
      expect(result).toBe(true);
    });

    test('should allow safe latin characters', () => {
      const result = validator.containsSuspiciousUnicode('google.com');
      
      expect(result).toBe(false);
    });
  });

  describe('Threat Analysis', () => {
    test('should analyze safe URLs with low risk', () => {
      const analysis = validator.analyzeThreats('https://google.com/search');
      
      expect(analysis.riskScore).toBeLessThan(4);
      expect(analysis.threats).toEqual([]);
      expect(analysis.isPopUnder).toBe(false);
    });

    test('should detect malicious domains', () => {
      const analysis = validator.analyzeThreats('https://adexchangeclear.com/malware');
      
      expect(analysis.riskScore).toBeGreaterThanOrEqual(8);
      expect(analysis.threats.length).toBeGreaterThan(0);
    });
  });
});
