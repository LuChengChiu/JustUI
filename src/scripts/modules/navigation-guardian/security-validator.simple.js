/**
 * SecurityValidator Module - Simplified version without unicode regex literals
 * URL and threat validation for NavigationGuardian with unicode-safe patterns
 */

import {
  SPECIAL_URLS_PATTERN,
  TRACKING_PARAMETERS,
  THREAT_SCORES,
} from "@script-utils/threat-patterns.js";

export class SecurityValidator {
  constructor() {
    this.allowedProtocols = ['http:', 'https:', 'ftp:', 'ftps:'];
    
    // Initialize unicode patterns using constructor to avoid parsing issues
    this.suspiciousUnicodeRanges = [
      { start: 0x0400, end: 0x04FF, name: 'Cyrillic' },
      { start: 0x0370, end: 0x03FF, name: 'Greek' },
      { start: 0x0590, end: 0x05FF, name: 'Hebrew' },
      { start: 0x0600, end: 0x06FF, name: 'Arabic' },
      { start: 0x4E00, end: 0x9FFF, name: 'CJK' },
      { start: 0x3040, end: 0x309F, name: 'Hiragana' },
      { start: 0x30A0, end: 0x30FF, name: 'Katakana' }
    ];
    
    this.urlThreatPatterns = [
      { pattern: /adexchangeclear\.com/i, score: THREAT_SCORES.adexchangeclear, threat: 'Known malicious ad network' },
      { pattern: /\.php\?.*param_[45]/i, score: THREAT_SCORES.phpTracking, threat: 'Ad tracking parameters' },
      { pattern: SPECIAL_URLS_PATTERN, score: THREAT_SCORES.aboutBlank, threat: 'Special URL (common pop-under technique)' },
      { pattern: /doubleclick\.net/i, score: 4, threat: 'Ad network domain' },
      { pattern: /googlesyndication\.com/i, score: 3, threat: 'Google ad network' },
      { pattern: /\.tk$|\.ml$|\.ga$/i, score: 4, threat: 'Suspicious TLD' },
      { pattern: /redirect|popup|popunder/i, score: 5, threat: 'Redirect/popup indicators' }
    ];

    // Use shared tracking parameters from threat-patterns.js
    this.suspiciousParams = TRACKING_PARAMETERS;
  }

  /**
   * Check for suspicious unicode characters using character code ranges
   */
  containsSuspiciousUnicode(hostname) {
    if (!hostname || typeof hostname !== 'string') {
      return false;
    }
    
    for (let i = 0; i < hostname.length; i++) {
      const charCode = hostname.charCodeAt(i);
      
      for (const range of this.suspiciousUnicodeRanges) {
        if (charCode >= range.start && charCode <= range.end) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Validate URL for security
   */
  validateURL(url) {
    const result = { isValid: false, displayURL: '', warnings: [] };
    
    if (!url || typeof url !== 'string') {
      result.displayURL = 'Blocked: Invalid URL input';
      result.warnings.push('Empty or invalid URL provided');
      return result;
    }

    try {
      const urlObj = new URL(url);
      
      // Check protocol
      if (!this.allowedProtocols.includes(urlObj.protocol)) {
        result.displayURL = `Blocked: Unsafe protocol (${urlObj.protocol})`;
        result.warnings.push(`Unsafe protocol: ${urlObj.protocol}`);
        return result;
      }
      
      // Check for suspicious unicode in hostname
      if (this.containsSuspiciousUnicode(urlObj.hostname)) {
        result.displayURL = 'Blocked: Suspicious characters in domain';
        result.warnings.push('Potential homograph attack detected');
        return result;
      }
      
      // URL is valid
      result.isValid = true;
      result.displayURL = url;
      return result;
      
    } catch (error) {
      result.displayURL = 'Blocked: Malformed URL';
      result.warnings.push(`URL parsing error: ${error.message}`);
      return result;
    }
  }

  /**
   * Analyze threats in URL
   */
  analyzeThreats(url) {
    const analysis = { riskScore: 0, threats: [], isPopUnder: false };
    
    if (!url || typeof url !== 'string') {
      analysis.riskScore = 2;
      analysis.threats.push({ type: 'Invalid URL input', score: 2 });
      return analysis;
    }

    try {
      // Check URL patterns
      for (const { pattern, score, threat } of this.urlThreatPatterns) {
        if (pattern.test(url)) {
          analysis.riskScore += score;
          analysis.threats.push({ type: threat, score });
        }
      }

      const urlObj = new URL(url);
      
      // Check suspicious parameters
      for (const param of this.suspiciousParams) {
        if (urlObj.searchParams.has(param)) {
          const score = 3;
          analysis.riskScore += score;
          analysis.threats.push({ type: `Suspicious parameter: ${param}`, score });
        }
      }

      // Check for random domain patterns (simplified)
      const hostname = urlObj.hostname;
      const hasRandomPattern = /[a-z0-9]{12,}/.test(hostname) && 
                              !/google|facebook|twitter|github|stackoverflow/.test(hostname);
      
      if (hasRandomPattern) {
        const score = 3;
        analysis.riskScore += score;
        analysis.threats.push({ type: 'Random domain name pattern', score });
      }

    } catch (error) {
      analysis.riskScore += 5;
      analysis.threats.push({ type: 'URL parsing error', score: 5 });
    }

    // Classify as pop-under if high risk
    analysis.isPopUnder = analysis.riskScore >= 7;
    
    return analysis;
  }

  /**
   * Get threat level classification
   */
  getThreatLevel(riskScore) {
    if (riskScore >= 7) {
      return { level: 'HIGH', color: '#dc2626', description: 'High risk - likely malicious content' };
    } else if (riskScore >= 4) {
      return { level: 'MEDIUM', color: '#d97706', description: 'Medium risk - suspicious patterns detected' };
    } else {
      return { level: 'LOW', color: '#059669', description: 'Low risk - appears safe' };
    }
  }

  /**
   * Get comprehensive security analysis
   */
  getSecurityAnalysis(url) {
    const validation = this.validateURL(url);
    const threatAnalysis = this.analyzeThreats(url);
    const threatLevel = this.getThreatLevel(threatAnalysis.riskScore);
    
    const recommendation = (!validation.isValid || threatAnalysis.riskScore >= 7) ? 'BLOCK' : 'ALLOW';
    
    return {
      validation,
      threatAnalysis,
      threatLevel,
      recommendation
    };
  }

  // Legacy API compatibility
  validateURLSecurity(url) {
    return this.validateURL(url).displayURL;
  }

  analyzeURLThreats(url) {
    return this.analyzeThreats(url);
  }
}