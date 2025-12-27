/**
 * Click Hijacking Protection Module
 * Prevents malicious overlays from intercepting user clicks
 */

import { MAX_Z_INDEX, HIGH_Z_INDEX_THRESHOLD } from "../constants.js";
export class ClickHijackingProtector {
  constructor() {
    this.isActive = false;
    this.capturedClicks = new Set();
    this.eventListeners = [];
    this.setupDocumentProtection();
  }

  /**
   * Activate click hijacking protection
   */
  activate() {
    this.isActive = true;
    console.log("OriginalUI: Click hijacking protection activated");
  }

  /**
   * Deactivate click hijacking protection
   */
  deactivate() {
    this.isActive = false;
    console.log("OriginalUI: Click hijacking protection deactivated");
  }

  /**
   * Clean up all event listeners and resources
   */
  cleanup() {
    this.isActive = false;
    
    // Remove all tracked event listeners
    this.eventListeners.forEach(({ element, type, handler, options }) => {
      try {
        element.removeEventListener(type, handler, options);
      } catch (error) {
        console.warn(`OriginalUI: Error removing ${type} listener:`, error);
      }
    });
    
    // Clear the listeners array
    this.eventListeners = [];
    this.capturedClicks.clear();
    
    console.log("OriginalUI: Click hijacking protection cleaned up");
  }

  /**
   * Setup document-level click capture
   * Intercepts clicks before malicious overlays can handle them
   */
  setupDocumentProtection() {
    // Capture phase - runs before any other click handlers
    const clickHandler = (event) => {
      if (!this.isActive) return;

      // Run advanced click analysis first
      const clickAllowed = this.handleAdvancedClickProtection(event);
      if (!clickAllowed) {
        return; // Click was blocked by advanced protection
      }

      const clickedElement = event.target;
      const suspiciousOverlay = this.findSuspiciousOverlay(clickedElement);

      if (suspiciousOverlay) {
        console.warn("OriginalUI: Blocked click on suspicious overlay", {
          overlay: suspiciousOverlay,
          clickTarget: clickedElement,
        });

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // Remove the overlay immediately
        this.removeSuspiciousOverlay(suspiciousOverlay);
        return false;
      }
    };

    const clickOptions = {
      capture: true, // Capture phase - highest priority
      passive: false, // Allow preventDefault
    };

    document.addEventListener("click", clickHandler, clickOptions);
    this.eventListeners.push({
      element: document,
      type: "click",
      handler: clickHandler,
      options: clickOptions
    });

    // Additional protection against pointer events
    this.setupPointerProtection();
  }

  /**
   * Advanced Click Protection: Intercept and analyze all click events for suspicious patterns
   * @param {Event} event - Click event to analyze
   * @returns {boolean} True if click is allowed, false if blocked
   */
  handleAdvancedClickProtection(event) {
    try {
      const clickTime = Date.now();
      const element = event.target;

      // Whitelist: Allow clicks on Navigation Guardian modal
      const modalRoot = element.closest('#justui-external-link-modal-root');
      if (modalRoot) {
        return true; // Allow click - this is our own modal
      }

      // Analyze the click context for suspicious patterns
      const suspiciousFactors = [];

      // Check if clicking on invisible or suspicious elements
      const computedStyle = window.getComputedStyle(element);
      const isInvisible =
        computedStyle.opacity === "0" ||
        computedStyle.visibility === "hidden" ||
        computedStyle.display === "none";

      if (isInvisible) {
        suspiciousFactors.push("invisible_element");
      }

      // Check for suspicious z-index (like the iframe overlays)
      const zIndex = parseInt(computedStyle.zIndex);
      if (zIndex > HIGH_Z_INDEX_THRESHOLD) {
        suspiciousFactors.push("high_z_index");
      }

      // Check for suspicious positioning
      const isFixed = computedStyle.position === "fixed";
      const coversFullScreen =
        element.offsetWidth >= window.innerWidth * 0.8 &&
        element.offsetHeight >= window.innerHeight * 0.8;

      if (isFixed && coversFullScreen) {
        suspiciousFactors.push("fullscreen_overlay");
      }

      // Check element attributes for ad-related patterns
      const suspiciousAttributes = [
        "data-ad",
        "data-click-url",
        "data-redirect",
        "data-popup",
        "data-popunder",
      ];

      const hasSuspiciousAttrs = suspiciousAttributes.some(
        (attr) => element.hasAttribute(attr) || element.closest(`[${attr}]`)
      );

      if (hasSuspiciousAttrs) {
        suspiciousFactors.push("suspicious_attributes");
      }

      // Check if element contains ad-related URLs in href or data attributes
      const elementHTML = element.outerHTML.toLowerCase();
      const adUrlPatterns = [
        "adexchangeclear.com",
        "doubleclick.net",
        "googlesyndication.com",
        "param_4=",
        "param_5=",
        "clicktracking",
        "redirect.php",
      ];

      const hasAdUrls = adUrlPatterns.some((pattern) =>
        elementHTML.includes(pattern)
      );

      if (hasAdUrls) {
        suspiciousFactors.push("ad_urls");
      }

      // If multiple suspicious factors, likely a malicious click
      const isSuspiciousClick = suspiciousFactors.length >= 2;

      if (isSuspiciousClick) {
        console.log("OriginalUI: Blocked suspicious click event:", {
          element:
            element.tagName +
            (element.className ? "." + element.className : ""),
          factors: suspiciousFactors,
          coords: { x: event.clientX, y: event.clientY },
        });

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // Show brief notification
        try {
          console.warn(
            "🛡️ OriginalUI blocked a suspicious click (likely ad/malware)"
          );
        } catch (e) {
          /* ignore */
        }

        return false;
      }
    } catch (error) {
      console.warn("OriginalUI: Error in advanced click protection:", error);
    }

    // Allow the click to proceed if not suspicious
    return true;
  }

  /**
   * Setup pointer event protection
   */
  setupPointerProtection() {
    const events = ["pointerdown", "pointerup", "mousedown", "mouseup"];

    events.forEach((eventType) => {
      const handler = (event) => {
        if (!this.isActive) return;

        const target = event.target;
        if (this.isSuspiciousInterceptor(target)) {
          console.warn(
            `OriginalUI: Blocked ${eventType} on suspicious element`,
            target
          );
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // Remove the interceptor
          target.remove();
          return false;
        }
      };

      const options = { capture: true, passive: false };
      document.addEventListener(eventType, handler, options);
      this.eventListeners.push({
        element: document,
        type: eventType,
        handler: handler,
        options: options
      });
    });
  }

  /**
   * Find suspicious overlay elements that might be intercepting clicks
   * @param {HTMLElement} clickedElement - The element that was clicked
   * @returns {HTMLElement|null} - Suspicious overlay if found
   */
  findSuspiciousOverlay(clickedElement) {
    // Check if the clicked element itself is suspicious
    if (this.isSuspiciousInterceptor(clickedElement)) {
      return clickedElement;
    }

    // Check for invisible overlays with high z-index covering the click area
    const elementsAtPoint = document.elementsFromPoint(
      event.clientX || 0,
      event.clientY || 0
    );

    for (const element of elementsAtPoint) {
      if (this.isSuspiciousInterceptor(element)) {
        return element;
      }
    }

    return null;
  }

  /**
   * Check if element is a suspicious click interceptor
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} - True if suspicious
   */
  isSuspiciousInterceptor(element) {
    if (!element || !element.style) return false;

    const style = window.getComputedStyle(element);
    const elementStyle = element.getAttribute("style") || "";

    // Pattern 1: Invisible full-screen overlay
    const isFixed = style.position === "fixed";
    const isFullWidth =
      style.width === "100%" || elementStyle.includes("width: 100%");
    const isFullHeight =
      style.height === "100%" || elementStyle.includes("height: 100%");
    const isInvisible =
      style.opacity === "0" || elementStyle.includes("opacity: 0");
    const hasHighZIndex = parseInt(style.zIndex) > MAX_Z_INDEX;
    const hasInset =
      elementStyle.includes("inset:") || elementStyle.includes("inset ");

    const isInvisibleOverlay =
      isFixed &&
      (isFullWidth || hasInset) &&
      (isFullHeight || hasInset) &&
      isInvisible &&
      hasHighZIndex;

    // Pattern 2: Iframe with suspicious characteristics
    const isIframe = element.tagName === "IFRAME";
    const hasAdSrc =
      element.src &&
      (element.src.includes("ads") ||
        element.src.includes("doubleclick") ||
        element.src.includes("googlesyndication"));

    // Pattern 3: Element positioned off-screen but still capturing events
    const isOffscreen =
      (parseInt(style.top) < -500 || parseInt(style.left) < -500) &&
      style.position === "absolute";

    return (
      isInvisibleOverlay ||
      (isIframe && (hasAdSrc || isInvisibleOverlay)) ||
      isOffscreen
    );
  }

  /**
   * Remove suspicious overlay and log the action
   * @param {HTMLElement} overlay - Suspicious overlay to remove
   */
  removeSuspiciousOverlay(overlay) {
    const overlayInfo = {
      tagName: overlay.tagName,
      className: overlay.className,
      id: overlay.id,
      src: overlay.src,
      style: overlay.getAttribute("style"),
      zIndex: window.getComputedStyle(overlay).zIndex,
    };

    console.log(
      "OriginalUI: Removing suspicious click hijacking overlay",
      overlayInfo
    );

    overlay.setAttribute("data-justui-removed", "click-hijacking-protection");
    overlay.remove();

    // Dispatch custom event for tracking
    document.dispatchEvent(
      new CustomEvent("justui:click-hijack-blocked", {
        detail: overlayInfo,
      })
    );
  }

  /**
   * Scan for existing suspicious overlays and remove them
   */
  scanAndRemoveExistingOverlays() {
    if (!this.isActive) return;

    const suspiciousSelectors = [
      'iframe[style*="position: fixed"][style*="opacity: 0"][style*="z-index"]',
      'div[style*="position: fixed"][style*="width: 100%"][style*="height: 100%"][style*="opacity: 0"]',
      'iframe[style*="inset:"][style*="opacity: 0"]',
      'div[style*="inset:"][style*="opacity: 0"][style*="z-index"]',
    ];

    let removedCount = 0;

    suspiciousSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (
          !element.hasAttribute("data-justui-removed") &&
          this.isSuspiciousInterceptor(element)
        ) {
          this.removeSuspiciousOverlay(element);
          removedCount++;
        }
      });
    });

    if (removedCount > 0) {
      console.log(
        `OriginalUI: Click protection scan removed ${removedCount} suspicious overlays`
      );
    }

    return removedCount;
  }
}
