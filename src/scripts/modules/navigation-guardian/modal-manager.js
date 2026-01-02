/**
 * ModalManager Module - UI modal handling for NavigationGuardian
 *
 * @fileoverview Provides comprehensive modal UI creation and management including XSS-safe element
 * creation, user interaction handling, keyboard shortcuts, and proper cleanup lifecycle management.
 * This module handles all user interface aspects of navigation confirmation modals.
 *
 * @example
 * // Basic modal usage
 * const modalManager = new ModalManager();
 * const userChoice = await modalManager.showConfirmationModal({
 *   url: 'https://example.com',
 *   threatDetails: { riskScore: 5, threats: [...] }
 * });
 *
 * @example
 * // Safe element creation
 * const button = modalManager.createSafeElement('button', {
 *   textContent: 'Click me',
 *   style: 'background: blue; color: white;'
 * });
 *
 * @module ModalManager
 * @extends CleanableModule
 * @since 1.0.0
 * @author OriginalUI Team
 */

import { showExternalLinkModal } from "@/components/external-link-modal.jsx";

/**
 * ModalManager class providing modal UI creation and lifecycle management
 * @class
 */
export class ModalManager {
  /**
   * Create a ModalManager instance
   * @constructor
   */
  constructor() {
    /**
     * Currently active modal configuration (for preventing duplicates)
     * Stores the config object while a modal is being shown
     * @type {Object|null}
     * @private
     */
    this.activeModal = null;

    /**
     * Statistics callback for tracking user decisions
     * @type {Function|null}
     * @private
     */
    this.statisticsCallback = null;

    /**
     * URL security validator callback
     * @type {Function|null}
     * @private
     */
    this.urlValidator = null;

    console.log("OriginalUI: ModalManager initialized");
  }

  /**
   * Set the statistics callback for tracking user decisions
   * @param {Function} callback - Function to call with (allowed: boolean) when user makes decision
   */
  setStatisticsCallback(callback) {
    this.statisticsCallback = callback;
  }

  /**
   * Set the URL validator callback for security validation
   * @param {Function} validator - Function to call with (url: string) for validation
   */
  setURLValidator(validator) {
    this.urlValidator = validator;
  }

  /**
   * Safely create a DOM element with text content (prevents XSS)
   * @param {string} tagName - Element tag name
   * @param {object} options - Element configuration
   * @param {string} [options.textContent] - Safe text content (auto-escaped)
   * @param {string} [options.style] - CSS styles via cssText
   * @param {Object} [options.attributes] - Element attributes to set
   * @param {HTMLElement[]} [options.children] - Child elements to append
   * @returns {HTMLElement} Created DOM element
   */
  createSafeElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    // Set text content safely (auto-escapes HTML)
    if (options.textContent) {
      element.textContent = options.textContent;
    }

    // Set styles via cssText (safe)
    if (options.style) {
      element.style.cssText = options.style;
    }

    // Set attributes
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    // Append children
    if (options.children) {
      options.children.forEach((child) => {
        if (child) element.appendChild(child);
      });
    }

    return element;
  }

  /**
   * Show navigation confirmation modal with threat details
   * @param {Object} config - Modal configuration
   * @param {string} config.url - The target URL to display
   * @param {Object} [config.threatDetails] - Optional threat analysis details
   * @param {number} [config.threatDetails.riskScore] - Risk score (0-20+)
   * @param {Array} [config.threatDetails.threats] - Array of detected threats
   * @param {boolean} [config.threatDetails.isPopUnder] - True if pop-under detected
   * @returns {Promise<Object>} Promise that resolves with {allowed: boolean, remember: boolean}
   */
  async showConfirmationModal(config) {
    const { url: targetURL, threatDetails = null } = config;

    // Prevent multiple modals for the same URL
    if (this.activeModal) {
      console.warn(
        "OriginalUI: Navigation modal already exists, ignoring duplicate"
      );
      return { allowed: false, remember: false }; // Default to deny for safety
    }

    // Validate URL for security before display (with error handling)
    let validatedURL = targetURL; // Default fallback
    if (this.urlValidator) {
      try {
        validatedURL = this.urlValidator(targetURL);
      } catch (validatorError) {
        console.error(
          "OriginalUI: Error in URL validator callback:",
          validatorError
        );
        // Use original URL as fallback - validation errors shouldn't break modal display
        validatedURL = targetURL;
      }
    }

    // Prepare config for React modal
    const modalConfig = {
      url: validatedURL,
      threatDetails: threatDetails,
    };

    try {
      // Set active modal reference to config (for duplicate prevention)
      this.activeModal = modalConfig;

      // Show React modal and await user decision (returns {allowed, remember})
      const result = await showExternalLinkModal(modalConfig);

      // Clear active modal flag
      this.activeModal = null;

      // Call statistics callback with full result
      if (this.statisticsCallback) {
        try {
          this.statisticsCallback(result);
        } catch (callbackError) {
          console.error(
            "OriginalUI: Error in statistics callback:",
            callbackError
          );
        }
      }

      console.log(
        "OriginalUI: Navigation Guardian modal result for",
        targetURL,
        ":",
        result
      );
      return result;
    } catch (error) {
      console.error("OriginalUI: Error showing React modal:", error);

      // Clear active modal flag on error
      this.activeModal = null;

      // Return deny with no remember for safety
      return { allowed: false, remember: false };
    }
  }

  /**
   * Legacy method for backward compatibility with NavigationGuardian
   * @param {string} targetURL - The target URL
   * @param {Function} callback - Callback function with {allowed, remember} result object
   * @param {Object} threatDetails - Optional threat analysis details
   * @deprecated Use showConfirmationModal() instead
   */
  showNavigationModal(targetURL, callback, threatDetails = null) {
    this.showConfirmationModal({ url: targetURL, threatDetails })
      .then((result) => {
        try {
          callback(result); // Pass full result object {allowed, remember}
        } catch (callbackError) {
          console.error("OriginalUI: Error in legacy callback:", callbackError);
          // Callback error handling - error already logged, no further action needed
        }
      })
      .catch((error) => {
        console.error("OriginalUI: Modal error:", error);
        try {
          callback({ allowed: false, remember: false }); // Default to deny for safety
        } catch (callbackError) {
          console.error(
            "OriginalUI: Error in legacy callback (fallback):",
            callbackError
          );
        }
      });
  }

  /**
   * Enhanced cleanup with comprehensive resource management
   */
  cleanup() {
    console.log("OriginalUI: Starting ModalManager cleanup...");

    try {
      // Clear active modal flag (React modal handles its own cleanup)
      this.activeModal = null;

      // Clear callbacks
      this.statisticsCallback = null;
      this.urlValidator = null;

      console.log("OriginalUI: ModalManager cleanup completed");
    } catch (error) {
      console.error("OriginalUI: Error during ModalManager cleanup:", error);
      throw error;
    }
  }
}
