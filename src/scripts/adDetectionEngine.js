// Advanced Ad Detection Engine for OriginalUI Chrome Extension
// Implements pattern-based detection rules with weighted scoring

import { MAX_Z_INDEX, HIGH_Z_INDEX_THRESHOLD } from './constants.js';

class AdDetectionEngine {
  constructor() {
    // Detection rule weights and thresholds
    this.rules = [
      {
        name: "HIGH_Z_OVERLAY",
        weight: 10,
        detector: this.detectHighZIndexOverlay,
      },
      { name: "CLICK_HIJACK", weight: 9, detector: this.detectClickHijacking },
      {
        name: "SUSPICIOUS_IFRAME",
        weight: 8,
        detector: this.detectSuspiciousIframe,
      },
      {
        name: "MALICIOUS_DOMAIN",
        weight: 7,
        detector: this.detectMaliciousDomain,
      },
      { name: "SCAM_LANGUAGE", weight: 5, detector: this.detectScamLanguage },
      {
        name: "INTERACTION_BLOCKING",
        weight: 4,
        detector: this.detectInteractionBlocking,
      },
      {
        name: "PROTOCOL_RELATIVE_URL",
        weight: 3,
        detector: this.detectProtocolRelativeUrls,
      },
      {
        name: "POPUP_SCRIPT_ANALYSIS",
        weight: 9,
        detector: this.detectPopUnderScripts,
      },
      {
        name: "MALICIOUS_EVENT_LISTENERS",
        weight: 8,
        detector: this.detectMaliciousListeners,
      },
      {
        name: "LOCALSTORAGE_ABUSE",
        weight: 6,
        detector: this.detectLocalStorageAbuse,
      },
    ];

    this.threshold = 15; // Configurable threshold for detection
    this.confidenceThreshold = 0.7; // Minimum confidence to mark as suspicious

    // Suspicious TLD patterns
    this.suspiciousTLDs =
      /\.(shop|xyz|top|buzz|click|online|site|tk|ml|ga|cf)$/i;

    // Random domain name patterns
    this.randomNamePatterns =
      /^[a-z]{8,15}(stam|earn|safe|secure|buy|deal)[a-z]{4,10}\./i;

    // Suspicious path patterns
    this.hashPaths = /\/[a-f0-9]{32,64}\//;
    this.deepPaths = /\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\//;

    // Multilingual scam patterns
    this.scamPatterns = {
      urgency: {
        en: /\b(limited time|act now|hurry|ending soon|last chance|today only|expires|urgent|immediate)\b/i,
        zh: /(立即|马上|限时|结束|最后机会|仅限今天|过期|紧急)/,
        es: /\b(tiempo limitado|actúa ahora|última oportunidad|urgente|inmediato)\b/i,
        fr: /\b(temps limité|agir maintenant|dernière chance|urgent|immédiat)\b/i,
      },
      savings: {
        en: /\b(save|discount|off|deal|huge savings|\d{2,3}% off|free|win|prize|special offer)\b/i,
        zh: /(折扣|优惠|省|减|巨额储蓄|免费|赢|奖品|特别优惠)/,
        es: /\b(descuento|ahorro|oferta|gratis|ganar|premio|oferta especial)\b/i,
        fr: /\b(réduction|économie|offre|gratuit|gagner|prix|offre spéciale)\b/i,
      },
      action: {
        en: /\b(click here|download now|install|register|sign up|claim|get)\b/i,
        zh: /(点击这里|立即下载|安装|注册|注册|声明|获得)/,
        es: /\b(haga clic aquí|descargar ahora|instalar|registrarse|reclamar|obtener)\b/i,
        fr: /\b(cliquez ici|télécharger maintenant|installer|s'inscrire|réclamer|obtenir)\b/i,
      },
    };
  }

  // Main analysis function
  async analyze(element) {
    try {
      let totalScore = 0;
      const matchedRules = [];
      const detectionResults = {};

      // Run all detection rules
      for (const rule of this.rules) {
        try {
          const result = await rule.detector.call(this, element);
          detectionResults[rule.name] = result;

          if (result.isMatch) {
            totalScore += rule.weight;
            matchedRules.push({
              rule: rule.name,
              score: rule.weight,
              details: result,
            });
          }
        } catch (error) {
          console.warn(`OriginalUI: Error executing rule ${rule.name}:`, error);
        }
      }

      const confidence = Math.min(totalScore / 30, 1.0); // Normalize to 0-1
      const isAd =
        totalScore >= this.threshold && confidence >= this.confidenceThreshold;

      return {
        isAd,
        confidence,
        totalScore,
        matchedRules,
        detectionResults,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("OriginalUI: Error in AdDetectionEngine.analyze:", error);
      return {
        isAd: false,
        confidence: 0,
        totalScore: 0,
        matchedRules: [],
        detectionResults: {},
        error: error.message,
      };
    }
  }

  // Phase 1: High-confidence detection rules

  // Z-Index + Overlay Detection (P0, 95% confidence)
  detectHighZIndexOverlay(element) {
    try {
      const style = window.getComputedStyle(element);
      const zIndex = parseInt(style.zIndex);
      const position = style.position;
      const rect = element.getBoundingClientRect();

      const isHighZIndex = zIndex >= MAX_Z_INDEX;
      const isFixed = position === "fixed";
      const coversScreen =
        rect.width >= window.innerWidth * 0.8 &&
        rect.height >= window.innerHeight * 0.8;

      // Additional checks for legitimacy
      const hasCloseButton = element.querySelector(
        '[class*="close"], [class*="dismiss"], .modal-close'
      );
      const isVideoPlayer =
        element.closest(".video-player, .player-container") !== null;
      const isLegitModal =
        element.classList.contains("modal") ||
        element.getAttribute("role") === "dialog";

      const score = isHighZIndex && isFixed && coversScreen ? 10 : 0;

      // Reduce score for legitimate use cases
      let adjustedScore = score;
      if (hasCloseButton && isLegitModal) adjustedScore -= 3;
      if (isVideoPlayer) adjustedScore -= 5;

      return {
        isMatch: adjustedScore >= 7,
        score: adjustedScore,
        rule: "HIGH_Z_OVERLAY",
        details: {
          zIndex,
          position,
          screenCoverage: { width: rect.width, height: rect.height },
          hasCloseButton,
          isVideoPlayer,
          isLegitModal,
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "HIGH_Z_OVERLAY",
        error: error.message,
      };
    }
  }

  // Click Hijacking Detection (P0, 90% confidence)
  detectClickHijacking(element) {
    try {
      // Check for window.open in onclick handlers
      const onclickAttr = element.getAttribute("onclick");
      const hasWindowOpen = onclickAttr && onclickAttr.includes("window.open");

      // Check for suspicious event listeners
      const hasDataRedirect =
        element.hasAttribute("data-href") ||
        element.hasAttribute("data-url") ||
        element.hasAttribute("data-redirect");

      // Check for overlay with pointer cursor
      const style = window.getComputedStyle(element);
      const isClickableOverlay =
        style.cursor === "pointer" &&
        (style.position === "fixed" || style.position === "absolute");

      // Check for suspicious external links
      const links = element.querySelectorAll("a[href]");
      let suspiciousLinkCount = 0;
      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (
          href &&
          href.startsWith("http") &&
          !href.includes(window.location.hostname)
        ) {
          suspiciousLinkCount++;
        }
      });

      let score = 0;
      if (hasWindowOpen) score += 9;
      if (hasDataRedirect && isClickableOverlay) score += 6;
      if (suspiciousLinkCount > 3) score += 4;

      return {
        isMatch: score >= 6,
        score,
        rule: "CLICK_HIJACK",
        details: {
          hasWindowOpen,
          hasDataRedirect,
          isClickableOverlay,
          suspiciousLinkCount,
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "CLICK_HIJACK",
        error: error.message,
      };
    }
  }

  // Suspicious Iframe Detection (P0, 85% confidence)
  detectSuspiciousIframe(iframe) {
    try {
      if (iframe.tagName !== "IFRAME") {
        return { isMatch: false, score: 0, rule: "SUSPICIOUS_IFRAME" };
      }

      const hasSrcdoc = iframe.hasAttribute("srcdoc");
      const sandbox = iframe.getAttribute("sandbox");
      const src = iframe.getAttribute("src");

      const allowsPopups = sandbox && sandbox.includes("allow-popups");
      const allowsScripts = sandbox && sandbox.includes("allow-scripts");
      const allowsSameOrigin = sandbox && sandbox.includes("allow-same-origin");

      // Check for suspicious source URLs
      const suspiciousSrc =
        src &&
        (this.suspiciousTLDs.test(src) ||
          src.includes("doubleclick") ||
          src.includes("googlesyndication") ||
          src.includes("ads") ||
          src.includes("popup"));

      let score = 0;
      if (hasSrcdoc && allowsPopups && allowsScripts) score += 8;
      if (suspiciousSrc) score += 6;
      if (allowsPopups && allowsSameOrigin && allowsScripts) score += 5;

      return {
        isMatch: score >= 5,
        score,
        rule: "SUSPICIOUS_IFRAME",
        details: {
          hasSrcdoc,
          sandbox,
          src,
          allowsPopups,
          allowsScripts,
          allowsSameOrigin,
          suspiciousSrc,
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "SUSPICIOUS_IFRAME",
        error: error.message,
      };
    }
  }

  // Phase 2: Domain & Network Pattern Rules

  // Malicious Domain Detection (P1, 80% confidence)
  detectMaliciousDomain(element) {
    try {
      const links = element.querySelectorAll("a[href], iframe[src]");
      let maxScore = 0;
      let suspiciousDomains = [];

      links.forEach((link) => {
        const url = link.getAttribute("href") || link.getAttribute("src");
        if (!url || !url.startsWith("http")) return;

        try {
          const urlObj = new URL(url);
          let domainScore = 0;

          // Check suspicious TLDs
          if (this.suspiciousTLDs.test(urlObj.hostname)) domainScore += 3;

          // Check random name patterns
          if (this.randomNamePatterns.test(urlObj.hostname)) domainScore += 4;

          // Check suspicious paths
          if (this.hashPaths.test(urlObj.pathname)) domainScore += 2;
          if (this.deepPaths.test(urlObj.pathname)) domainScore += 2;

          if (domainScore >= 3) {
            suspiciousDomains.push({
              domain: urlObj.hostname,
              score: domainScore,
              url,
            });
            maxScore = Math.max(maxScore, domainScore);
          }
        } catch (urlError) {
          // Invalid URL, potentially suspicious
        }
      });

      return {
        isMatch: maxScore >= 5,
        score: maxScore,
        rule: "MALICIOUS_DOMAIN",
        details: {
          suspiciousDomains,
          totalLinks: links.length,
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "MALICIOUS_DOMAIN",
        error: error.message,
      };
    }
  }

  // Phase 3: Content & Behavioral Pattern Rules

  // Scam Language Detection (P1, 75% confidence)
  detectScamLanguage(element) {
    try {
      const text = element.innerText || "";
      if (text.length < 10) {
        return { isMatch: false, score: 0, rule: "SCAM_LANGUAGE" };
      }

      let matches = 0;
      let matchedPatterns = [];

      // Check all language patterns
      for (const [category, languagePatterns] of Object.entries(
        this.scamPatterns
      )) {
        for (const [language, pattern] of Object.entries(languagePatterns)) {
          if (pattern.test(text)) {
            matches++;
            matchedPatterns.push(`${category}-${language}`);
          }
        }
      }

      const score = matches * 2;

      return {
        isMatch: matches >= 2,
        score,
        rule: "SCAM_LANGUAGE",
        details: {
          textLength: text.length,
          matches,
          matchedPatterns,
          textPreview: text.substring(0, 100),
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "SCAM_LANGUAGE",
        error: error.message,
      };
    }
  }

  // User Interaction Blocking Detection (P2, 70% confidence)
  detectInteractionBlocking(element) {
    try {
      const style = window.getComputedStyle(element);

      const blocksSelection = style.userSelect === "none";
      const hidesOverflow = style.overflow === "hidden";
      const preventsInteraction = style.pointerEvents === "none";
      const hasHighOpacity = parseFloat(style.opacity) > 0.8;

      // Check if it's covering a large area
      const rect = element.getBoundingClientRect();
      const coversLargeArea =
        rect.width * rect.height > window.innerWidth * window.innerHeight * 0.3;

      let score = 0;
      if (blocksSelection && coversLargeArea) score += 2;
      if (hidesOverflow && element === document.body) score += 3;
      if (preventsInteraction && hasHighOpacity) score += 2;

      return {
        isMatch: score >= 4,
        score,
        rule: "INTERACTION_BLOCKING",
        details: {
          blocksSelection,
          hidesOverflow,
          preventsInteraction,
          hasHighOpacity,
          coversLargeArea,
          elementArea: rect.width * rect.height,
          viewportArea: window.innerWidth * window.innerHeight,
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "INTERACTION_BLOCKING",
        error: error.message,
      };
    }
  }

  // Protocol Relative URL Detection (P2, 60% confidence)
  detectProtocolRelativeUrls(element) {
    try {
      const links = element.querySelectorAll(
        "a[href], img[src], iframe[src], script[src]"
      );
      let protocolRelativeCount = 0;

      links.forEach((link) => {
        const url = link.getAttribute("href") || link.getAttribute("src");
        if (url && url.startsWith("//")) {
          protocolRelativeCount++;
        }
      });

      const score = protocolRelativeCount > 2 ? 3 : 0;

      return {
        isMatch: protocolRelativeCount > 2,
        score,
        rule: "PROTOCOL_RELATIVE_URL",
        details: {
          protocolRelativeCount,
          totalElements: links.length,
        },
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "PROTOCOL_RELATIVE_URL",
        error: error.message,
      };
    }
  }

  // Advanced Pop-Under Script Detection (P0, 95% confidence)
  detectPopUnderScripts(element) {
    try {
      let score = 0;
      let detectedPatterns = [];
      
      // Check for script elements with pop-under patterns
      const scripts = element.tagName === 'SCRIPT' ? [element] : element.querySelectorAll('script');
      
      scripts.forEach(script => {
        const scriptContent = script.textContent || script.innerHTML || '';
        
        // Pop-under script patterns (high confidence indicators)
        const popUnderPatterns = [
          { pattern: /triggerPopUnder/i, score: 10, name: 'triggerPopUnder function' },
          { pattern: /window\.open.*_blank.*window\.focus/i, score: 9, name: 'popup with focus manipulation' },
          { pattern: /localStorage\.setItem.*lastPopUnderTime/i, score: 8, name: 'pop-under rate limiting' },
          { pattern: /document\.addEventListener.*click.*once.*true/i, score: 7, name: 'single-use click listener' },
          { pattern: /adexchangeclear\.com/i, score: 6, name: 'known ad network' },
          { pattern: /param_[45].*encodeURIComponent/i, score: 6, name: 'ad tracking parameters' },
          { pattern: /generateClickId/i, score: 5, name: 'click ID generation' },
          { pattern: /DELAY_IN_MILLISECONDS/i, score: 5, name: 'delay-based behavior' }
        ];
        
        popUnderPatterns.forEach(({ pattern, score: patternScore, name }) => {
          if (pattern.test(scriptContent)) {
            score += patternScore;
            detectedPatterns.push({
              pattern: name,
              score: patternScore,
              match: scriptContent.match(pattern)?.[0]
            });
          }
        });
      });
      
      // Check for inline event handlers with suspicious patterns
      const elementsWithEvents = element.querySelectorAll('[onclick], [onmouseover], [onmouseout]');
      elementsWithEvents.forEach(el => {
        const onclick = el.getAttribute('onclick') || '';
        const onmouseover = el.getAttribute('onmouseover') || '';
        
        if (onclick.includes('window.open') || onmouseover.includes('window.open')) {
          score += 6;
          detectedPatterns.push({
            pattern: 'inline popup handler',
            score: 6,
            element: el.tagName
          });
        }
      });
      
      return {
        isMatch: score >= 8,
        score,
        rule: "POPUP_SCRIPT_ANALYSIS",
        details: {
          totalScripts: scripts.length,
          detectedPatterns,
          riskLevel: score >= 15 ? 'HIGH' : score >= 8 ? 'MEDIUM' : 'LOW'
        }
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "POPUP_SCRIPT_ANALYSIS",
        error: error.message
      };
    }
  }
  
  // Malicious Event Listener Detection (P0, 90% confidence)
  detectMaliciousListeners(element) {
    try {
      let score = 0;
      let suspiciousEvents = [];
      
      // Check for elements with suspicious event listener patterns
      const clickableElements = element.querySelectorAll('[onclick], a, button, div[style*="cursor"], *[data-click]');
      
      clickableElements.forEach(el => {
        const onclick = el.getAttribute('onclick') || '';
        const href = el.getAttribute('href') || '';
        const dataClick = el.getAttribute('data-click') || '';
        
        // Check for suspicious click patterns
        const suspiciousClickPatterns = [
          { pattern: /window\.open\(/i, score: 5, name: 'window.open call' },
          { pattern: /location\.href\s*=/i, score: 4, name: 'location redirect' },
          { pattern: /location\.assign|location\.replace/i, score: 4, name: 'navigation methods' },
          { pattern: /top\.location/i, score: 3, name: 'frame breaking' }
        ];
        
        suspiciousClickPatterns.forEach(({ pattern, score: patternScore, name }) => {
          if (pattern.test(onclick) || pattern.test(href) || pattern.test(dataClick)) {
            score += patternScore;
            suspiciousEvents.push({
              element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
              pattern: name,
              score: patternScore
            });
          }
        });
        
        // Check for suspicious href patterns
        if (href && (
          href.includes('adexchangeclear.com') ||
          href.includes('param_4=') ||
          href.includes('param_5=') ||
          /\.php\?.*redirect/i.test(href)
        )) {
          score += 6;
          suspiciousEvents.push({
            element: el.tagName,
            pattern: 'malicious href',
            score: 6,
            href: href.substring(0, 50) + '...'
          });
        }
      });
      
      // Check for document-level event listeners (harder to detect, but we can infer)
      const hasDocumentListeners = element === document.body || element === document.documentElement;
      if (hasDocumentListeners && score > 0) {
        score += 3; // Boost score for document-level suspicious activity
      }
      
      return {
        isMatch: score >= 7,
        score,
        rule: "MALICIOUS_EVENT_LISTENERS",
        details: {
          suspiciousEvents,
          totalClickableElements: clickableElements.length,
          hasDocumentListeners
        }
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "MALICIOUS_EVENT_LISTENERS",
        error: error.message
      };
    }
  }
  
  // LocalStorage Abuse Detection (P1, 85% confidence)
  detectLocalStorageAbuse(element) {
    try {
      let score = 0;
      let abusePatterns = [];
      
      // Check for scripts that abuse localStorage
      const scripts = element.tagName === 'SCRIPT' ? [element] : element.querySelectorAll('script');
      
      scripts.forEach(script => {
        const scriptContent = script.textContent || script.innerHTML || '';
        
        // LocalStorage abuse patterns
        const storagePatterns = [
          { pattern: /localStorage\.setItem.*lastPopUnderTime/i, score: 8, name: 'pop-under timing storage' },
          { pattern: /localStorage\.setItem.*clickId/i, score: 6, name: 'click tracking storage' },
          { pattern: /localStorage\.setItem.*adClick/i, score: 6, name: 'ad click storage' },
          { pattern: /localStorage\.getItem.*Pop/i, score: 5, name: 'popup state checking' },
          { pattern: /sessionStorage\.setItem.*redirect/i, score: 4, name: 'redirect session storage' }
        ];
        
        storagePatterns.forEach(({ pattern, score: patternScore, name }) => {
          if (pattern.test(scriptContent)) {
            score += patternScore;
            abusePatterns.push({
              pattern: name,
              score: patternScore
            });
          }
        });
      });
      
      // Check current localStorage for suspicious entries
      try {
        const suspiciousKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.includes('lastPopUnderTime') ||
            key.includes('popunder') ||
            key.includes('adClick') ||
            key.includes('clickId') ||
            key.toLowerCase().includes('popup')
          )) {
            suspiciousKeys.push(key);
            score += 3;
          }
        }
        
        if (suspiciousKeys.length > 0) {
          abusePatterns.push({
            pattern: 'existing malicious localStorage entries',
            score: suspiciousKeys.length * 3,
            keys: suspiciousKeys
          });
        }
      } catch (storageError) {
        // localStorage access might be restricted
      }
      
      return {
        isMatch: score >= 6,
        score,
        rule: "LOCALSTORAGE_ABUSE",
        details: {
          abusePatterns,
          totalScripts: scripts.length
        }
      };
    } catch (error) {
      return {
        isMatch: false,
        score: 0,
        rule: "LOCALSTORAGE_ABUSE",
        error: error.message
      };
    }
  }

  // Update detection threshold
  setThreshold(newThreshold) {
    this.threshold = Math.max(0, Math.min(100, newThreshold));
  }

  // Get rule configuration
  getRuleConfig() {
    return this.rules.map((rule) => ({
      name: rule.name,
      weight: rule.weight,
      enabled: true, // Default to enabled
    }));
  }

  // Enable/disable specific rules
  configureRule(ruleName, enabled, weight = null) {
    const rule = this.rules.find((r) => r.name === ruleName);
    if (rule) {
      rule.enabled = enabled;
      if (weight !== null) {
        rule.weight = Math.max(0, Math.min(10, weight));
      }
    }
  }
}

// Export for bundling
export default AdDetectionEngine;
