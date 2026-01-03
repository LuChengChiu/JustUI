/**
 * Click Hijacking Protection Module
 * Prevents malicious overlays from intercepting user clicks
 */

import Logger from '@script-utils/logger.js';
import { MAX_Z_INDEX } from "@/scripts/constants.js";

// Detection thresholds and constants
const SUSPICIOUS_THRESHOLD = 2; // Number of suspicious factors needed to block a click
const FULLSCREEN_COVERAGE_THRESHOLD = 0.8; // Element must cover 80% of viewport to be considered fullscreen

export class ClickHijackingProtector {
  constructor() {
    this.isActive = false;
    this.eventListeners = [];
    this._isDocumentProtectionSetup = false;

    // Create stable bound handler references ONCE (memory leak prevention)
    // These references are reused if setupDocumentProtection() is called multiple times
    this._boundClickHandler = this._handleClickCapture.bind(this);
    this._boundPointerHandler = this._handlePointerEvent.bind(this);

    this.setupDocumentProtection();
  }

  /**
   * Activate click hijacking protection
   */
  activate() {
    this.isActive = true;
    Logger.info('ClickProtectionActivated', 'Click hijacking protection activated');
  }

  /**
   * Deactivate click hijacking protection
   */
  deactivate() {
    this.isActive = false;
    Logger.info('ClickProtectionDeactivated', 'Click hijacking protection deactivated');
  }

  /**
   * Clean up all event listeners and resources
   */
  cleanup() {
    this.isActive = false;
    this._isDocumentProtectionSetup = false;

    // Remove all tracked event listeners
    this.eventListeners.forEach(({ element, type, handler, options }) => {
      try {
        element.removeEventListener(type, handler, options);
      } catch (error) {
        Logger.warn('ListenerRemoveError', 'Error removing event listener', { type, error });
      }
    });

    // Clear the listeners array
    this.eventListeners = [];

    Logger.info('ClickProtectionCleanup', 'Click hijacking protection cleaned up');
  }

  /**
   * Handle click events in capture phase
   * @param {Event} event - Click event
   * @private
   * @note This method is bound in constructor to create stable handler reference
   */
  _handleClickCapture(event) {
    if (!this.isActive) return;

    // Run advanced click analysis first
    const clickAllowed = this.handleAdvancedClickProtection(event);
    if (!clickAllowed) {
      return; // Click was blocked by advanced protection
    }

    const clickedElement = event.target;
    const suspiciousOverlay = this.findSuspiciousOverlay(
      clickedElement,
      event
    );

    if (suspiciousOverlay) {
      Logger.security('ClickHijackBlocked', 'Blocked click on suspicious overlay', {
        overlay: suspiciousOverlay.tagName,
        clickTarget: clickedElement.tagName
      });

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Remove the overlay immediately
      this.removeSuspiciousOverlay(suspiciousOverlay);
      return false;
    }
  }

  /**
   * Handle pointer events (pointerdown, pointerup, mousedown, mouseup)
   * @param {Event} event - Pointer event
   * @private
   * @note This method is bound in constructor to create stable handler reference
   */
  _handlePointerEvent(event) {
    if (!this.isActive) return;

    const target = event.target;
    if (this.isSuspiciousInterceptor(target)) {
      Logger.security('PointerEventBlocked', 'Blocked pointer event on suspicious element', {
        eventType: event.type,
        target: target.tagName
      });
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Remove the interceptor
      target.remove();
      return false;
    }
  }

  /**
   * Setup document-level click capture
   * Intercepts clicks before malicious overlays can handle them
   * IDEMPOTENT: Safe to call multiple times (uses stable handler reference)
   */
  setupDocumentProtection() {
    if (this._isDocumentProtectionSetup) {
      return;
    }
    this._isDocumentProtectionSetup = true;

    const clickOptions = {
      capture: true, // Capture phase - highest priority
      passive: false, // Allow preventDefault
    };

    // Use stable bound reference created in constructor
    // DOM will automatically deduplicate if called multiple times
    document.addEventListener("click", this._boundClickHandler, clickOptions);
    this.eventListeners.push({
      element: document,
      type: "click",
      handler: this._boundClickHandler,
      options: clickOptions,
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
      const element = event.target;

      // Whitelist: Allow clicks on Navigation Guardian modal
      const modalRoot = element.closest("#originalui-external-link-modal-root");
      if (modalRoot) {
        return true; // Allow click - this is our own modal
      }

      // Analyze the click context for suspicious patterns
      const suspiciousFactors = [];

      // Check if clicking on invisible or suspicious elements
      const {
        opacity,
        visibility,
        display,
        position,
        zIndex: rawZIndex,
        ...computedStyleProps
      } = window.getComputedStyle(element);
      const isInvisible =
        opacity === "0" || visibility === "hidden" || display === "none";

      if (isInvisible) {
        suspiciousFactors.push("invisible_element");
      }

      // Check for suspicious z-index (like the iframe overlays)
      const zIndex = parseInt(rawZIndex);
      if (zIndex > MAX_Z_INDEX) {
        suspiciousFactors.push("high_z_index");
      }

      const isFixed = position === "fixed";
      if (
        (isFixed || position === "absolute") &&
        computedStyleProps.top === "0px" &&
        computedStyleProps.left === "0px"
      ) {
        suspiciousFactors.push("absolute_overlay");
      }

      // Check for suspicious positioning
      const coversFullScreen =
        element.offsetWidth >=
          window.innerWidth * FULLSCREEN_COVERAGE_THRESHOLD &&
        element.offsetHeight >=
          window.innerHeight * FULLSCREEN_COVERAGE_THRESHOLD;

      if (position === "fixed" && coversFullScreen) {
        suspiciousFactors.push("fullscreen_overlay");
      }

      // If multiple suspicious factors, likely a malicious click
      const isSuspiciousClick =
        suspiciousFactors.length >= SUSPICIOUS_THRESHOLD;

      if (isSuspiciousClick) {
        Logger.security('SuspiciousClickBlocked', 'Blocked suspicious click event', {
          element: element.tagName + (element.className ? "." + element.className : ""),
          factors: suspiciousFactors,
          coords: { x: event.clientX, y: event.clientY }
        });

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
    } catch (error) {
      Logger.warn('ClickProtectionError', 'Error in advanced click protection', { error });
    }

    return true;
  }

  /**
   * Setup pointer event protection
   * IDEMPOTENT: Safe to call multiple times (uses stable handler reference)
   */
  setupPointerProtection() {
    const events = ["pointerdown", "pointerup", "mousedown", "mouseup"];
    const options = { capture: true, passive: false };

    events.forEach((eventType) => {
      // Use stable bound reference created in constructor
      // DOM will automatically deduplicate if called multiple times
      document.addEventListener(eventType, this._boundPointerHandler, options);
      this.eventListeners.push({
        element: document,
        type: eventType,
        handler: this._boundPointerHandler,
        options: options,
      });
    });
  }

  /**
   * Find suspicious overlay elements that might be intercepting clicks
   * @param {HTMLElement} clickedElement - The element that was clicked
   * @param {Event} event - The click event (needed for coordinates)
   * @returns {HTMLElement|null} - Suspicious overlay if found
   */
  findSuspiciousOverlay(clickedElement, event) {
    // Check if the clicked element itself is suspicious
    if (this.isSuspiciousInterceptor(clickedElement)) {
      return clickedElement;
    }

    // Safety check: ensure event exists
    if (!event) {
      return null;
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

    Logger.security('OverlayRemoved', 'Removing suspicious click hijacking overlay', overlayInfo);

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
      Logger.info('OverlayScanComplete', 'Click protection scan complete', { removedCount });
    }

    return removedCount;
  }
}
