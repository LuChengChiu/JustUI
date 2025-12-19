/**
 * ScriptAnalyzer Module
 * Provides advanced script content analysis and real-time monitoring for malicious scripts
 */
export class ScriptAnalyzer {
  constructor() {
    this.isActive = false;
    this.scriptObserver = null;
    this.blockedScriptsCount = 0;
    console.log('JustUI: ScriptAnalyzer initialized');
  }

  /**
   * Activate script analysis and monitoring
   */
  activate() {
    this.isActive = true;
    this.scanExistingScripts();
    this.startMonitoring();
    console.log('JustUI: Script analysis and monitoring activated');
  }

  /**
   * Deactivate script analysis and monitoring
   */
  deactivate() {
    this.isActive = false;
    this.stopMonitoring();
    console.log('JustUI: Script analysis and monitoring deactivated');
  }

  /**
   * Real-time Script Analysis: Advanced pop-under signature detection
   * @param {string} scriptContent - Content of the script to analyze
   * @param {HTMLElement} scriptElement - The script element being analyzed
   * @returns {Object} Analysis results with risk score and threats
   */
  analyzeScriptContent(scriptContent, scriptElement) {
    const analysis = {
      riskScore: 0,
      threats: [],
      isPopUnder: false,
      shouldBlock: false
    };
    
    // Pop-under signature patterns with weighted scoring
    const popUnderSignatures = [
      { pattern: /triggerPopUnder\s*=\s*\(\s*\)\s*=>\s*\{/i, score: 10, threat: 'Explicit pop-under function' },
      { pattern: /const\s+e\s*=\s*parseInt\(localStorage\.getItem\('lastPopUnderTime'\)/i, score: 9, threat: 'Pop-under rate limiting mechanism' },
      { pattern: /window\.open\(.*,\s*'_blank'\).*window\.focus\(\)/s, score: 8, threat: 'Pop-under with focus manipulation' },
      { pattern: /document\.addEventListener\('click',.*,\s*\{\s*once:\s*!0\s*\}\)/i, score: 7, threat: 'Single-use click hijacking listener' },
      { pattern: /BASE_URL\s*\+\s*'\?param_4=/i, score: 6, threat: 'Ad exchange URL construction' },
      { pattern: /generateClickId\s*\(\s*\)/i, score: 5, threat: 'Click tracking ID generation' },
      { pattern: /DELAY_IN_MILLISECONDS/i, score: 4, threat: 'Pop-under timing delay' },
      { pattern: /adexchangeclear\.com/i, score: 6, threat: 'Known malicious ad network' },
      { pattern: /\.php\?.*param_[45]/i, score: 5, threat: 'Ad tracking parameters' }
    ];
    
    // Analyze against each signature
    popUnderSignatures.forEach(({ pattern, score, threat }) => {
      if (pattern.test(scriptContent)) {
        analysis.riskScore += score;
        analysis.threats.push({
          type: threat,
          score: score,
          match: scriptContent.match(pattern)?.[0]?.substring(0, 50) + '...'
        });
      }
    });
    
    // Advanced behavioral analysis
    const behaviorPatterns = [
      { pattern: /localStorage\.setItem.*Time.*\d+/, score: 3, threat: 'Timestamp tracking behavior' },
      { pattern: /window\.location\.hostname/, score: 2, threat: 'Domain checking behavior' },
      { pattern: /Math\.random\(\)\.toString\(36\)/, score: 2, threat: 'Random ID generation' },
      { pattern: /encodeURIComponent.*param/, score: 3, threat: 'URL parameter encoding' },
      { pattern: /Date\.now\(\)/, score: 1, threat: 'Timestamp usage' }
    ];
    
    behaviorPatterns.forEach(({ pattern, score, threat }) => {
      if (pattern.test(scriptContent)) {
        analysis.riskScore += score;
        analysis.threats.push({ type: threat, score: score });
      }
    });
    
    // Determine if script should be blocked
    analysis.isPopUnder = analysis.riskScore >= 8;
    analysis.shouldBlock = analysis.riskScore >= 6; // Lower threshold for blocking
    
    return analysis;
  }

  /**
   * Scan existing scripts on the page for malicious content
   */
  scanExistingScripts() {
    try {
      // Patterns that indicate malicious pop-under scripts (legacy patterns for quick detection)
      const suspiciousPatterns = [
        /triggerPopUnder/i,
        /window\.open.*_blank.*window\.focus/,
        /localStorage\.setItem.*lastPopUnderTime/i,
        /document\.addEventListener.*click.*once.*true/,
        /adexchangeclear\.com/i,
        /\.php\?.*param_[45]/i,
        /generateClickId/i
      ];
      
      // Remove existing suspicious scripts from DOM with advanced analysis
      const existingScripts = document.querySelectorAll('script');
      let blockedScriptsCount = 0;
      
      existingScripts.forEach(script => {
        const scriptContent = script.textContent || script.innerHTML;
        
        // Use both legacy patterns and advanced analysis
        const legacyMatch = suspiciousPatterns.some(pattern => pattern.test(scriptContent));
        const analysis = this.analyzeScriptContent(scriptContent, script);
        
        if (legacyMatch || analysis.shouldBlock) {
          console.log('JustUI: Blocked malicious script:', {
            legacyMatch,
            analysis: {
              riskScore: analysis.riskScore,
              isPopUnder: analysis.isPopUnder,
              threats: analysis.threats.map(t => t.type)
            },
            contentPreview: scriptContent.substring(0, 100) + '...'
          });
          
          script.remove();
          blockedScriptsCount++;
        }
      });
      
      if (blockedScriptsCount > 0) {
        console.log(`🛡️ JustUI: Blocked ${blockedScriptsCount} malicious scripts on page load`);
        this.blockedScriptsCount += blockedScriptsCount;
      }
      
    } catch (error) {
      console.error('JustUI: Error scanning existing scripts:', error);
    }
  }

  /**
   * Start monitoring for new script injections
   */
  startMonitoring() {
    try {
      // Patterns that indicate malicious pop-under scripts
      const suspiciousPatterns = [
        /triggerPopUnder/i,
        /window\.open.*_blank.*window\.focus/,
        /localStorage\.setItem.*lastPopUnderTime/i,
        /document\.addEventListener.*click.*once.*true/,
        /adexchangeclear\.com/i,
        /\.php\?.*param_[45]/i,
        /generateClickId/i
      ];

      // Monitor for new script injections with real-time analysis
      this.scriptObserver = new MutationObserver(mutations => {
        if (!this.isActive) return;
        
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const scripts = node.tagName === 'SCRIPT' ? [node] : 
                            node.querySelectorAll ? node.querySelectorAll('script') : [];
              
              scripts.forEach(script => {
                const scriptContent = script.textContent || script.innerHTML;
                
                // Real-time analysis of dynamically injected scripts
                const legacyMatch = suspiciousPatterns.some(pattern => pattern.test(scriptContent));
                const analysis = this.analyzeScriptContent(scriptContent, script);
                
                if (legacyMatch || analysis.shouldBlock) {
                  console.log('JustUI: Blocked dynamic script injection:', {
                    timing: 'real-time',
                    legacyMatch,
                    analysis: {
                      riskScore: analysis.riskScore,
                      isPopUnder: analysis.isPopUnder,
                      threats: analysis.threats.map(t => ({
                        type: t.type,
                        score: t.score
                      }))
                    },
                    src: script.getAttribute('src') || 'inline',
                    contentPreview: scriptContent.substring(0, 100) + '...'
                  });
                  
                  // Remove the script before it executes
                  script.remove();
                  this.blockedScriptsCount++;
                  
                  // Show user notification for high-risk pop-unders
                  if (analysis.isPopUnder) {
                    console.warn('🛡️ JustUI: Blocked high-risk pop-under script injection');
                  }
                }
              });
            }
          });
        });
      });
      
      // Start observing for script injections
      const targetNode = document.documentElement || document.body;
      if (targetNode) {
        this.scriptObserver.observe(targetNode, {
          childList: true,
          subtree: true
        });
        console.log('JustUI: Script monitoring active');
      }
      
    } catch (error) {
      console.error('JustUI: Error setting up script monitoring:', error);
    }
  }

  /**
   * Stop monitoring script injections
   */
  stopMonitoring() {
    if (this.scriptObserver) {
      this.scriptObserver.disconnect();
      this.scriptObserver = null;
      console.log('JustUI: Script monitoring stopped');
    }
  }

  /**
   * Get current analysis statistics
   * @returns {Object} Current statistics and status
   */
  getStats() {
    return {
      isActive: this.isActive,
      blockedScriptsCount: this.blockedScriptsCount,
      monitoringActive: !!this.scriptObserver
    };
  }

  /**
   * Clean up all resources and monitoring
   */
  cleanup() {
    this.isActive = false;
    this.stopMonitoring();
    this.blockedScriptsCount = 0;
    console.log('JustUI: ScriptAnalyzer cleaned up');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.blockedScriptsCount = 0;
  }
}