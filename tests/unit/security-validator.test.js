/**
 * Unit Tests for SecurityValidator Module
 * Tests URL validation, threat analysis, and security features
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { SecurityValidator } from '@modules/navigation-guardian/security-validator.js';

// Mock console to capture error messages
const mockConsole = {
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn()
};

global.console = mockConsole;

describe('SecurityValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new SecurityValidator();
    // Clear mock calls
    Object.values(mockConsole).forEach(mock => mock.mockClear());
  });

  describe('URL Validation', () => {
    test('should validate safe HTTPS URLs', () => {
      const result = validator.validateURL('https://google.com/search');
      
      expect(result.isValid).toBe(true);
      expect(result.displayURL).toBe('https://google.com/search');
      expect(result.warnings).toEqual([]);
    });

    test('should validate safe HTTP URLs', () => {
      const result = validator.validateURL('http://example.com');
      
      expect(result.isValid).toBe(true);
      expect(result.displayURL).toBe('http://example.com');
      expect(result.warnings).toEqual([]);
    });

    test('should validate safe FTP URLs', () => {
      const result = validator.validateURL('ftp://files.example.com');
      
      expect(result.isValid).toBe(true);
      expect(result.displayURL).toBe('ftp://files.example.com');
      expect(result.warnings).toEqual([]);
    });

    test('should block javascript: protocol', () => {
      const result = validator.validateURL('javascript:alert(\\"xss\\")');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toContain('Blocked: Unsafe protocol (javascript:)');
      expect(result.warnings).toContain('Unsafe protocol: javascript:');
    });

    test('should block data: protocol', () => {
      const result = validator.validateURL('data:text/html,<script>alert(1)</script>');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toContain('Blocked: Unsafe protocol (data:)');
      expect(result.warnings).toContain('Unsafe protocol: data:');
    });

    test('should block vbscript: protocol', () => {
      const result = validator.validateURL('vbscript:msgbox(\\"xss\\")');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toContain('Blocked: Unsafe protocol (vbscript:)');
      expect(result.warnings).toContain('Unsafe protocol: vbscript:');
    });

    test('should handle null/undefined URLs', () => {
      expect(validator.validateURL(null).isValid).toBe(false);
      expect(validator.validateURL(undefined).isValid).toBe(false);
      expect(validator.validateURL('').isValid).toBe(false);
    });

    test('should handle malformed URLs', () => {
      const result = validator.validateURL('not-a-url');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toBe('Blocked: Malformed URL');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should detect homograph attacks', () => {
      // Cyrillic domain that looks like google.com
      const result = validator.validateURL('https://\u0433\u043e\u043e\u0433\u043be.com');
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toBe('Blocked: Suspicious characters in domain');
      expect(result.warnings).toContain('Potential homograph attack detected');
    });

    test('should detect mixed script attacks', () => {
      // Greek characters mixed with Latin
      const result = validator.validateURL('https://g\u03bf\u03bfgle.com'); // Contains Greek omicron
      
      expect(result.isValid).toBe(false);
      expect(result.displayURL).toBe('Blocked: Suspicious characters in domain');
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

    test('should detect suspicious TLDs', () => {
      const analysis = validator.analyzeThreats('https://malicious-site.tk');
      
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.threats.some(t => t.type === 'Suspicious TLD')).toBe(true);
    });

    test('should detect redirect indicators', () => {
      const analysis = validator.analyzeThreats('https://example.com/redirect?popup=true');
      
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.threats.some(t => t.type === 'Redirect/popup indicators')).toBe(true);
    });

    test('should detect random domain patterns', () => {
      const analysis = validator.analyzeThreats('https://abc123def456ghi.com');
      
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.threats.some(t => t.type === 'Random domain name pattern')).toBe(true);
    });

    test('should handle null/undefined input gracefully', () => {
      const nullAnalysis = validator.analyzeThreats(null);
      expect(nullAnalysis.riskScore).toBe(2);
      expect(nullAnalysis.threats[0].type).toBe('Invalid URL input');
      
      const undefinedAnalysis = validator.analyzeThreats(undefined);
      expect(undefinedAnalysis.riskScore).toBe(2);
    });

    test('should classify pop-unders correctly', () => {
      // High risk should be pop-under
      const highRisk = validator.analyzeThreats('https://adexchangeclear.com/popup?param_4=test');
      expect(highRisk.isPopUnder).toBe(true);
      
      // Low risk should not be pop-under
      const lowRisk = validator.analyzeThreats('https://google.com');
      expect(lowRisk.isPopUnder).toBe(false);
    });
  });

  describe('Threat Level Classification', () => {
    test('should classify HIGH threat level', () => {
      const level = validator.getThreatLevel(10);
      
      expect(level.level).toBe('HIGH');
      expect(level.color).toBe('#dc2626');
      expect(level.description).toBe('High risk - likely malicious content');
    });

    test('should classify MEDIUM threat level', () => {
      const level = validator.getThreatLevel(5);
      
      expect(level.level).toBe('MEDIUM');
      expect(level.color).toBe('#d97706');
      expect(level.description).toBe('Medium risk - suspicious patterns detected');
    });

    test('should classify LOW threat level', () => {
      const level = validator.getThreatLevel(2);
      
      expect(level.level).toBe('LOW');
      expect(level.color).toBe('#059669');
      expect(level.description).toBe('Low risk - appears safe');
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
      const analysis = validator.getSecurityAnalysis('javascript:alert(\\"xss\\")');
      
      expect(analysis.validation.isValid).toBe(false);
      expect(analysis.threatAnalysis.riskScore).toBeGreaterThanOrEqual(10);
      expect(analysis.recommendation).toBe('BLOCK');
    });
  });

  describe('Legacy Method Compatibility', () => {
    test('validateURLSecurity should match validateURL behavior', () => {
      const url = 'https://google.com';
      const newResult = validator.validateURL(url);
      const legacyResult = validator.validateURLSecurity(url);
      
      expect(legacyResult).toBe(newResult.displayURL);
    });

    test('analyzeURLThreats should match analyzeThreats behavior', () => {
      const url = 'https://adexchangeclear.com';
      const newResult = validator.analyzeThreats(url);
      const legacyResult = validator.analyzeURLThreats(url);
      
      expect(legacyResult).toEqual(newResult);
    });
  });

  describe('Unicode Detection', () => {
    test('should detect various suspicious unicode patterns', () => {
      expect(validator.containsSuspiciousUnicode('\u0433\u043e\u043e\u0433\u043be.com')).toBe(true); // Cyrillic
      expect(validator.containsSuspiciousUnicode('g\u03bf\u03bfgle.com')).toBe(true); // Greek
      expect(validator.containsSuspiciousUnicode('\u05d2oogle.com')).toBe(true); // Hebrew
      expect(validator.containsSuspiciousUnicode('\ufea0oogle.com')).toBe(true); // Arabic
      expect(validator.containsSuspiciousUnicode('google.com')).toBe(false); // Safe Latin
    });

    test('should handle null/empty hostnames', () => {
      expect(validator.containsSuspiciousUnicode(null)).toBe(false);
      expect(validator.containsSuspiciousUnicode('')).toBe(false);
      expect(validator.containsSuspiciousUnicode(123)).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should handle multiple URL validations efficiently', () => {
      const urls = [
        'https://google.com',
        'https://github.com',
        'https://stackoverflow.com',
        'javascript:alert(\\"test\\")',
        'data:text/html,test'
      ];
      
      const start = performance.now();
      urls.forEach(url => {
        validator.validateURL(url);
        validator.analyzeThreats(url);
      });
      const end = performance.now();
      
      // Should complete 10 operations (5 validate + 5 analyze) in reasonable time
      expect(end - start).toBeLessThan(100); // 100ms limit for 10 operations
    });

    test('should be stateless and thread-safe', () => {
      // Multiple instances should not interfere with each other
      const validator2 = new SecurityValidator();
      
      const result1 = validator.validateURL('https://google.com');
      const result2 = validator2.validateURL('https://google.com');
      
      expect(result1).toEqual(result2);
      
      // Modifying one shouldn't affect the other
      validator.allowedProtocols.push('custom:');
      expect(validator2.allowedProtocols).not.toContain('custom:');
    });
  });
});
