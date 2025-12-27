/**
 * SecurityValidator Module - URL and threat validation for NavigationGuardian
 *
 * @fileoverview Provides comprehensive security validation for URLs including protocol checking,
 * homograph attack detection, and malicious pattern analysis. This module is stateless and focuses
 * solely on security validation logic extracted from NavigationGuardian.
 *
 * @example
 * // Basic URL validation
 * const validator = new SecurityValidator();
 * const result = validator.validateURL('https://example.com');
 *
 * @example
 * // Threat analysis
 * const analysis = validator.analyzeThreats('https://malicious-site.com/redirect?param_4=123');
 * console.log(`Risk Score: ${analysis.riskScore}, Threats: ${analysis.threats.length}`);
 *
 * @module SecurityValidator
 * @since 1.0.0
 * @author OriginalUI Team
 */

/**
 * SecurityValidator class providing URL security validation and threat analysis
 * @class
 */
export class SecurityValidator {
  /**
   * Create a SecurityValidator instance
   * @constructor
   */
  constructor() {
    /**
     * Allowed protocols for URL validation
     * @type {string[]}
     * @private
     */
    this.allowedProtocols = ["http:", "https:", "ftp:", "ftps:"];

    /**
     * Suspicious unicode patterns for homograph attack detection
     * @type {RegExp[]}
     * @private
     */
    this.suspiciousUnicodePatterns = [
      /[\u0400-\u04FF]/, // Cyrillic
      /[\u0370-\u03FF]/, // Greek
      /[\u0590-\u05FF]/, // Hebrew
      /[\u0600-\u06FF]/, // Arabic
      /[\u4E00-\u9FFF]/, // CJK Unified Ideographs
      /[\u3040-\u309F]/, // Hiragana
      /[\u30A0-\u30FF]/, // Katakana
    ];

    /**
     * URL threat patterns with associated risk scores
     * @type {Array<{pattern: RegExp, score: number, threat: string}>}
     * @private
     */
    this.urlThreatPatterns = [
      {
        pattern: /adexchangeclear\.com/i,
        score: 8,
        threat: "Known malicious ad network",
      },
      {
        pattern: /\.php\?.*param_[45]/i,
        score: 6,
        threat: "Ad tracking parameters",
      },
      {
        pattern: /about:blank/i,
        score: 5,
        threat: "Blank page (common pop-under technique)",
      },
      { pattern: /doubleclick\.net/i, score: 4, threat: "Ad network domain" },
      {
        pattern: /googlesyndication\.com/i,
        score: 3,
        threat: "Google ad network",
      },
      { pattern: /\.tk$|\.ml$|\.ga$/i, score: 4, threat: "Suspicious TLD" },
      {
        pattern: /redirect|popup|popunder/i,
        score: 5,
        threat: "Redirect/popup indicators",
      },
    ];

    /**
     * Suspicious URL query parameters
     * @type {string[]}
     * @private
     */
    this.suspiciousParams = [
      "param_4",
      "param_5",
      "clickid",
      "adclick",
      "redirect",
    ];
  }

  /**
   * Validate URL for security (protocol and unicode checks only)
   * @param {string} url - The URL to validate
   * @returns {Object} Validation result with display URL and security status
   * @returns {boolean} returns.isValid - True if URL passes security validation
   * @returns {string} returns.displayURL - URL safe for display (original or warning message)
   * @returns {string[]} returns.warnings - Array of security warnings
   */
  validateURL(url) {
    const result = {
      isValid: false,
      displayURL: "",
      warnings: [],
    };

    // Handle null, undefined, or empty strings
    if (!url || typeof url !== "string") {
      result.displayURL = "Invalid URL";
      result.warnings.push("URL is null, undefined, or not a string");
      return result;
    }

    try {
      const urlObj = new URL(url);

      // Check for dangerous protocols
      if (!this.allowedProtocols.includes(urlObj.protocol)) {
        result.displayURL = `Blocked: Unsafe protocol (${urlObj.protocol})`;
        result.warnings.push(`Unsafe protocol: ${urlObj.protocol}`);
        return result;
      }

      // Check for suspicious unicode characters (homograph attacks)
      if (this.containsSuspiciousUnicode(urlObj.hostname)) {
        result.displayURL = "Blocked: Suspicious characters in domain";
        result.warnings.push("Potential homograph attack detected");
        return result;
      }

      // URL passed all security checks
      result.isValid = true;
      result.displayURL = url;
      return result;
    } catch (error) {
      // Invalid URL structure
      result.displayURL = "Blocked: Malformed URL";
      result.warnings.push(`Malformed URL: ${error.message}`);
      return result;
    }
  }

  /**
   * Legacy method for backward compatibility - returns display URL string
   * @param {string} url - The URL to validate
   * @returns {string} Original URL if safe, or security warning if blocked
   * @deprecated Use validateURL() instead for more detailed validation results
   */
  validateURLSecurity(url) {
    const result = this.validateURL(url);
    return result.displayURL;
  }

  /**
   * Check for suspicious unicode characters that could indicate homograph attacks
   * @param {string} hostname - The hostname to check
   * @returns {boolean} True if suspicious characters detected
   */
  containsSuspiciousUnicode(hostname) {
    if (!hostname || typeof hostname !== "string") {
      return false;
    }

    return this.suspiciousUnicodePatterns.some((pattern) =>
      pattern.test(hostname)
    );
  }

  /**
   * Analyze URLs for malicious patterns and calculate risk score
   * @param {string} url - URL to analyze
   * @returns {Object} Analysis results with risk score and threats
   * @returns {number} returns.riskScore - Calculated risk score (0-20+)
   * @returns {Array} returns.threats - Array of detected threats with type and score
   * @returns {boolean} returns.isPopUnder - True if likely pop-under attempt (score >= 6)
   */
  analyzeThreats(url) {
    const analysis = {
      riskScore: 0,
      threats: [],
      isPopUnder: false,
    };

    if (!url || typeof url !== "string") {
      analysis.threats.push({ type: "Invalid URL input", score: 2 });
      analysis.riskScore = 2;
      return analysis;
    }

    try {
      // Check URL against threat patterns
      this.urlThreatPatterns.forEach(({ pattern, score, threat }) => {
        if (pattern.test(url)) {
          analysis.riskScore += score;
          analysis.threats.push({ type: threat, score });
        }
      });

      // Check for suspicious URL structure
      try {
        const urlObj = new URL(url);

        // Check for suspicious query parameters
        this.suspiciousParams.forEach((param) => {
          if (urlObj.searchParams.has(param)) {
            analysis.riskScore += 3;
            analysis.threats.push({
              type: `Suspicious parameter: ${param}`,
              score: 3,
            });
          }
        });

        // Check for random-looking domains
        if (/[a-z0-9]{10,20}\./i.test(urlObj.hostname)) {
          analysis.riskScore += 2;
          analysis.threats.push({
            type: "Random domain name pattern",
            score: 2,
          });
        }

        // Check for suspicious unicode in hostname
        if (this.containsSuspiciousUnicode(urlObj.hostname)) {
          analysis.riskScore += 4;
          analysis.threats.push({
            type: "Suspicious unicode characters (homograph attack)",
            score: 4,
          });
        }
      } catch (urlError) {
        analysis.riskScore += 3;
        analysis.threats.push({ type: "Malformed URL", score: 3 });
      }

      // Determine if this is likely a pop-under attempt
      analysis.isPopUnder = analysis.riskScore >= 6;
    } catch (error) {
      console.warn("OriginalUI: Error analyzing URL threats:", error);
      analysis.threats.push({ type: "Analysis error", score: 1 });
      analysis.riskScore += 1;
    }

    return analysis;
  }

  /**
   * Legacy method for backward compatibility
   * @param {string} url - URL to analyze
   * @returns {Object} Analysis results with risk score and threats
   * @deprecated Use analyzeThreats() instead (same interface)
   */
  analyzeURLThreats(url) {
    return this.analyzeThreats(url);
  }

  /**
   * Get threat level classification based on risk score
   * @param {number} riskScore - Risk score from threat analysis
   * @returns {Object} Threat level information
   * @returns {string} returns.level - Threat level ('LOW', 'MEDIUM', 'HIGH')
   * @returns {string} returns.color - CSS color for threat level display
   * @returns {string} returns.description - Human-readable threat description
   */
  getThreatLevel(riskScore) {
    if (riskScore >= 8) {
      return {
        level: "HIGH",
        color: "#dc2626",
        description: "High risk - likely malicious content",
      };
    } else if (riskScore >= 4) {
      return {
        level: "MEDIUM",
        color: "#d97706",
        description: "Medium risk - suspicious patterns detected",
      };
    } else {
      return {
        level: "LOW",
        color: "#059669",
        description: "Low risk - appears safe",
      };
    }
  }

  /**
   * Get comprehensive security analysis for a URL
   * @param {string} url - URL to analyze
   * @returns {Object} Complete security analysis
   */
  getSecurityAnalysis(url) {
    const validation = this.validateURL(url);
    const threatAnalysis = this.analyzeThreats(url);
    const threatLevel = this.getThreatLevel(threatAnalysis.riskScore);

    return {
      validation,
      threatAnalysis,
      threatLevel,
      recommendation:
        validation.isValid && threatAnalysis.riskScore < 4 ? "ALLOW" : "BLOCK",
    };
  }
}
