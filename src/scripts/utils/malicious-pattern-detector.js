import {
  URL_THREAT_PATTERNS,
  THREAT_SCORES,
  isSpecialUrl,
} from "./threat-patterns.js";
import Logger from "./logger.js";

/**
 * MaliciousPatternDetector
 * High-signal pattern detection for pop-under and malicious script analysis.
 *
 * Design principles:
 * - Only high-signal patterns (low false positive risk)
 * - No behavioral patterns (too many false positives)
 * - Risk scoring system for nuanced detection
 * - Tight regex patterns requiring specific syntax
 */

export const MaliciousPatternDetector = {

  patterns: {

    // CRITICAL: Explicit pop-under signatures (Score: 9-10)
    // False positive risk: LOW
    criticalSignatures: [
      {
        pattern: /triggerPopUnder\s*=\s*(?:function\s*\(|\(\s*\)\s*=>)/i,
        score: 10,
        threat: 'Explicit pop-under function declaration'
      },
      {
        pattern: /const\s+\w+\s*=\s*parseInt\(localStorage\.getItem\(['"]lastPopUnderTime['"]\)/i,
        score: 9,
        threat: 'Pop-under rate limiting mechanism'
      },
      {
        pattern: /window\.open\([^)]*['"]_blank['"][^)]*\)[^}]*window\.focus\(\)/s,
        score: 9,
        threat: 'Pop-under with focus manipulation'
      }
    ],

    // HIGH: Pop-under infrastructure (Score: 6-7)
    // False positive risk: LOW
    highRiskPatterns: [
      {
        pattern: /document\.addEventListener\s*\(\s*['"]click['"][^)]*\{\s*once\s*:\s*(?:true|!0)\s*\}/i,
        score: 7,
        threat: 'Single-use click hijacking listener'
      },
      {
        pattern: /generateClickId\s*=\s*(?:function|\([^)]*\)\s*=>)/i,
        score: 6,
        threat: 'Click tracking ID generation function'
      },
      {
        pattern: /(?:const|let|var)\s+DELAY_IN_MILLISECONDS\s*=\s*\d+/i,
        score: 6,
        threat: 'Pop-under timing delay constant'
      }
    ],

    // Note: mediumRiskPatterns removed - now use shared patterns from threat-patterns.js
  },

  /**
   * Analyze code with weighted risk scoring
   * @param {string} code - JavaScript code to analyze
   * @param {number} threshold - Minimum score to consider malicious (default: 6)
   * @returns {Object} Analysis results with riskScore, threats, isMalicious, matchedPatterns
   */
  analyze(code, threshold = 6) {
    const analysis = {
      riskScore: 0,
      threats: [],
      isMalicious: false,
      matchedPatterns: []
    };

    if (!code || typeof code !== 'string') {
      return analysis;
    }

    const allPatterns = [
      ...this.patterns.criticalSignatures,
      ...this.patterns.highRiskPatterns,
    ];

    allPatterns.forEach(({ pattern, score, threat }) => {
      try {
        if (pattern.test(code)) {
          analysis.riskScore += score;
          analysis.threats.push(threat);
          analysis.matchedPatterns.push({
            threat,
            score,
            match: code.match(pattern)?.[0]?.substring(0, 100)
          });
        }
      } catch (error) {
        // Ignore regex errors silently
        Logger.warn('MaliciousPatternDetector', 'Pattern test error', {
          error: error.message
        });
      }
    });

    // Check shared patterns from threat-patterns.js
    try {
      if (URL_THREAT_PATTERNS.phpTracking.test(code)) {
        analysis.riskScore += THREAT_SCORES.phpTracking;
        analysis.threats.push('Malicious PHP tracking parameters');
        analysis.matchedPatterns.push({
          threat: 'Malicious PHP tracking parameters',
          score: THREAT_SCORES.phpTracking,
          match: code.match(URL_THREAT_PATTERNS.phpTracking)?.[0]?.substring(0, 100)
        });
      }

      if (URL_THREAT_PATTERNS.adNetworks.test(code)) {
        analysis.riskScore += THREAT_SCORES.genericAdNetwork;
        analysis.threats.push('Known pop-under ad network');
        analysis.matchedPatterns.push({
          threat: 'Known pop-under ad network',
          score: THREAT_SCORES.genericAdNetwork,
          match: code.match(URL_THREAT_PATTERNS.adNetworks)?.[0]?.substring(0, 100)
        });
      }
    } catch (error) {
      Logger.warn('MaliciousPatternDetector', 'Shared pattern test error', {
        error: error.message
      });
    }

    analysis.isMalicious = analysis.riskScore >= threshold;

    return analysis;
  },

  /**
   * Quick check for URL-based patterns (for window.open URLs)
   * @param {string} url - URL to check
   * @returns {boolean} True if URL matches malicious patterns
   */
  isUrlMalicious(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Use shared patterns from threat-patterns.js
    try {
      return (
        URL_THREAT_PATTERNS.adNetworks.test(url) ||
        URL_THREAT_PATTERNS.phpTracking.test(url) ||
        URL_THREAT_PATTERNS.popUnderKeyword.test(url) ||
        isSpecialUrl(url)
      );
    } catch {
      return false;
    }
  }
};
