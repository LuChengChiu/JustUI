/**
 * Shadow DOM Utilities for OriginalUI Extension
 *
 * @fileoverview Provides comprehensive Shadow DOM creation and management utilities
 * for rendering UI components with complete CSS isolation from host page styles.
 * This module is designed for Chrome Extension content scripts that need to inject
 * UI elements without being affected by aggressive page CSS.
 *
 * @module shadowDOM
 * @since 1.0.0
 * @author OriginalUI Team
 */
import Logger from "@script-utils/logger.js";

/**
 * CSS content cache for performance optimization
 * @type {string|null}
 * @private
 */
let cachedCSS = null;

/**
 * DEPRECATED: Google Fonts CSS cache (no longer used - fonts are bundled locally)
 * @type {string|null}
 * @private
 * @deprecated Fonts are now bundled in index.css, no remote fetching needed
 */
let cachedFonts = null;

/**
 * Creates a Shadow DOM container with portal target for React rendering
 *
 * @description
 * This function creates a complete Shadow DOM setup for rendering isolated UI:
 * 1. Creates a light DOM container element with fixed positioning and max z-index
 * 2. Attaches a Shadow DOM root in "open" mode for debugging compatibility
 * 3. Creates a portal target div inside the Shadow DOM for React portal rendering
 * 4. Appends the container to document.body
 *
 * The light DOM container uses `pointer-events: none` to allow clicks to pass through
 * to the Shadow DOM content, which has `pointer-events: auto`.
 *
 * @returns {{container: HTMLDivElement, shadowRoot: ShadowRoot, portalTarget: HTMLDivElement}}
 *   Object containing:
 *   - container: Light DOM element (for removal during cleanup)
 *   - shadowRoot: Shadow DOM root (for CSS injection)
 *   - portalTarget: React portal rendering target inside Shadow DOM
 *
 * @throws {Error} If Shadow DOM is not supported by the browser
 *
 * @example
 * const { container, shadowRoot, portalTarget } = createShadowDOMContainer();
 * // Inject CSS into shadowRoot
 * // Render React portal into portalTarget
 * // Later: container.remove() for cleanup
 */
export function createShadowDOMContainer() {
  // Create light DOM host element with fixed positioning
  const container = document.createElement("div");
  container.id = "originalui-external-link-modal-root";

  // Set critical inline styles for positioning and layering
  // pointer-events: none allows clicks to pass through to Shadow DOM content
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2147483647;
    width: 100%;
    height: 100%;
    pointer-events: none;
  `;

  // Attach Shadow DOM with open mode for debugging and DevTools compatibility
  // Open mode allows external JavaScript to access Shadow DOM via element.shadowRoot
  const shadowRoot = container.attachShadow({ mode: "open" });

  // Create portal target div inside Shadow DOM
  // This is where React will render the modal content
  const portalTarget = document.createElement("div");
  portalTarget.className = "shadow-content";

  // Enable pointer events on the portal target (clicks will work normally)
  portalTarget.style.cssText = `
    pointer-events: auto;
    width: 100%;
    height: 100%;
  `;

  shadowRoot.appendChild(portalTarget);

 // Append container to document body
 document.body.appendChild(container);

  Logger.info("ShadowDOM", "Created Shadow DOM container with portal target");

  return {
    container,
    shadowRoot,
    portalTarget,
  };
}

/**
 * Fetches CSS content from Chrome extension URL with caching
 *
 * @description
 * Fetches the compiled Tailwind CSS file from the Chrome extension using
 * chrome.runtime.getURL(). Results are cached in memory to avoid redundant
 * network requests when opening multiple modals.
 *
 * The CSS file must be listed in manifest.json's `web_accessible_resources`
 * for this function to work correctly.
 *
 * @param {string} [cssPath='index.css'] - Path to CSS file relative to extension root
 * @returns {Promise<string>} Promise resolving to CSS content as text
 *
 * @throws {Error} If chrome.runtime is unavailable or CSS fetch fails
 *
 * @example
 * const cssContent = await fetchCSSContent();
 * Logger.info("ShadowDOM", "Loaded CSS content", { size: cssContent.length });
 *
 * @example
 * // Custom CSS file
 * const customCSS = await fetchCSSContent('styles/custom.css');
 */
export async function fetchCSSContent(cssPath = "index.css") {
  // Return cached CSS if available
  if (cachedCSS) {
    Logger.debug("ShadowDOM", "Using cached CSS content");
    return cachedCSS;
  }

  try {
    // Validate Chrome runtime availability
    if (!chrome?.runtime?.getURL) {
      throw new Error("Chrome runtime API unavailable");
    }

    // Get CSS file URL from Chrome extension
    const cssURL = chrome.runtime.getURL(cssPath);
    Logger.info("ShadowDOM", "Fetching CSS", { cssURL });

    // Fetch CSS content
    const startTime = performance.now();
    const response = await fetch(cssURL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    cachedCSS = await response.text();
    const endTime = performance.now();

    Logger.info("ShadowDOM", "Fetched CSS content", {
      size: cachedCSS.length,
      durationMs: Number((endTime - startTime).toFixed(2))
    });

    return cachedCSS;
  } catch (error) {
    Logger.error("ShadowDOM", "Failed to fetch CSS content", error);
    throw error;
  }
}

/**
 * Injects CSS content into Shadow DOM with automatic font URL rewriting
 *
 * @description
 * Creates a <style> element with the provided CSS content and appends it to
 * the Shadow DOM root. This provides complete CSS isolation from the host page.
 *
 * **Critical URL Rewriting:**
 * When CSS is injected as inline text (not linked via <link>), relative URLs
 * resolve relative to the PAGE URL, not the extension URL. This function
 * automatically rewrites relative font URLs from:
 * - `url(./Font.ttf)` → `url(chrome-extension://[id]/Font.ttf)`
 *
 * This ensures fonts load correctly from the extension bundle when injected
 * into content script Shadow DOMs on any webpage.
 *
 * The style element is appended directly to the Shadow Root, making all CSS
 * rules scoped to elements within the Shadow DOM.
 *
 * @param {ShadowRoot} shadowRoot - Shadow DOM root to inject CSS into
 * @param {string} cssContent - CSS content as text (typically from fetchCSSContent)
 * @returns {HTMLStyleElement} The created style element (for reference or removal)
 *
 * @throws {Error} If shadowRoot is invalid or CSS injection fails
 *
 * @example
 * const cssContent = await fetchCSSContent();
 * const styleElement = injectCSSIntoShadow(shadowRoot, cssContent);
 * // Fonts load correctly: url(./Font.ttf) → url(chrome-extension://[id]/Font.ttf)
 *
 * @example
 * // Custom CSS
 * const customCSS = '.modal { background: blue; }';
 * injectCSSIntoShadow(shadowRoot, customCSS);
 */
export function injectCSSIntoShadow(shadowRoot, cssContent) {
  if (!shadowRoot || !(shadowRoot instanceof ShadowRoot)) {
    throw new Error("Invalid Shadow DOM root provided");
  }

  return new Promise((resolve, reject) => {
    try {
      const startTime = performance.now();

      // CRITICAL: Use <link> element instead of inline <style> for font loading
      // Shadow DOM @font-face rules with chrome-extension:// URLs don't trigger
      // font downloads when injected as inline textContent. Using <link> gives
      // the browser proper context to resolve and request font files.
      const linkElement = document.createElement("link");
      linkElement.rel = "stylesheet";
      linkElement.type = "text/css";
      linkElement.href = chrome.runtime.getURL("index.css");

      // Add identifier for debugging
      linkElement.setAttribute("data-justui-style", "tailwind");

      // Wait for CSS to load before resolving
      linkElement.onload = () => {
        const endTime = performance.now();
        Logger.info("ShadowDOM", "CSS <link> loaded successfully", {
          durationMs: Number((endTime - startTime).toFixed(2)),
          href: linkElement.href
        });
        resolve(linkElement);
      };

      linkElement.onerror = (error) => {
        Logger.error("ShadowDOM", "Failed to load CSS <link>", error, {
          href: linkElement.href
        });
        reject(new Error(`Failed to load CSS from ${linkElement.href}`));
      };

      // Inject into Shadow DOM
      shadowRoot.appendChild(linkElement);

      Logger.info("ShadowDOM", "Injected CSS <link> into Shadow DOM", {
        href: linkElement.href
      });
    } catch (error) {
      Logger.error("ShadowDOM", "Failed to inject CSS into Shadow DOM", error);
      reject(error);
    }
  });
}

/**
 * Injects font @font-face rules into main document head
 *
 * @description
 * CRITICAL FIX: Shadow DOM blocks font loading from chrome-extension:// URLs.
 * Solution: Inject @font-face rules into main document <head> instead.
 * Fonts defined globally in main document are accessible to Shadow DOM elements.
 *
 * This only needs to run once per page load.
 *
 * @returns {boolean} True if fonts were injected, false if already injected
 */
export function injectFontsIntoDocument() {
  // Check if already injected
  if (document.getElementById('originalui-fonts')) {
    return false;
  }

  try {
    const startTime = performance.now();

    const fontStyle = document.createElement('style');
    fontStyle.id = 'originalui-fonts';
    fontStyle.textContent = `
      /* Days One Font */
      @font-face {
        font-family: "Days One";
        src: url("${chrome.runtime.getURL('days-one-regular.ttf')}") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      /* Barlow Font Family */
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-thin.ttf')}") format("truetype");
        font-weight: 100;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-extra-light.ttf')}") format("truetype");
        font-weight: 200;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-light.ttf')}") format("truetype");
        font-weight: 300;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-regular.ttf')}") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-medium.ttf')}") format("truetype");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-semi-bold.ttf')}") format("truetype");
        font-weight: 600;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-bold.ttf')}") format("truetype");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-extra-bold.ttf')}") format("truetype");
        font-weight: 800;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Barlow";
        src: url("${chrome.runtime.getURL('barlow-black.ttf')}") format("truetype");
        font-weight: 900;
        font-style: normal;
        font-display: swap;
      }
    `;

    document.head.appendChild(fontStyle);

    const endTime = performance.now();
    Logger.info("ShadowDOM", "Injected font @font-face rules into document <head>", {
      durationMs: Number((endTime - startTime).toFixed(2))
    });

    return true;
  } catch (error) {
    Logger.error("ShadowDOM", "Failed to inject fonts into document head", error);
    return false;
  }
}

/**
 * Injects base typography styles into Shadow DOM
 *
 * @description
 * Sets base typography on Shadow DOM root. Fonts are now loaded globally
 * in main document via injectFontsIntoDocument(), so Shadow DOM elements
 * can use them via font-family.
 *
 * @param {ShadowRoot} shadowRoot - The Shadow DOM root to inject styles into
 * @returns {HTMLStyleElement} The created style element
 */
export function injectBaseShadowStyles(shadowRoot) {
  if (!shadowRoot || !(shadowRoot instanceof ShadowRoot)) {
    throw new Error("Invalid Shadow DOM root provided");
  }

  try {
    const startTime = performance.now();

    const baseStyleElement = document.createElement("style");
    baseStyleElement.setAttribute("data-justui-style", "shadow-base");
    baseStyleElement.textContent = `
      :host, .shadow-content {
        font-family: Barlow, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
        font-size: 14px;
        line-height: 1.4;
        color: #111827;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
    `;

    shadowRoot.insertBefore(baseStyleElement, shadowRoot.firstChild);

    const endTime = performance.now();
    Logger.info("ShadowDOM", "Injected base Shadow DOM typography styles", {
      durationMs: Number((endTime - startTime).toFixed(2))
    });

    return baseStyleElement;
  } catch (error) {
    Logger.error("ShadowDOM", "Failed to inject base Shadow DOM styles", error);
    throw error;
  }
}

/**
 * Verifies that bundled fonts are available in Shadow DOM
 *
 * @description
 * This function is now a no-op since fonts are bundled locally and included
 * in the index.css file that gets injected into Shadow DOM via injectCSSIntoShadow().
 *
 * **Architecture (Local Fonts):**
 * 1. Fonts are self-hosted in /fonts/Days_One/ and /fonts/Barlow/
 * 2. @font-face rules defined in src/index.css reference local font files
 * 3. Vite bundles CSS and rewrites font URLs to chrome-extension:// URLs
 * 4. Build process copies fonts to dist/fonts/ (see vite.config.js:225)
 * 5. injectCSSIntoShadow() injects bundled CSS with @font-face rules
 * 6. Shadow DOM inherits font definitions from injected CSS - fonts are ready immediately
 *
 * **Benefits of Local Fonts:**
 * - ✅ Zero network overhead - no runtime fetches
 * - ✅ No CSP violations - no external requests
 * - ✅ Privacy-first - no Google tracking
 * - ✅ Offline-compatible - works without internet
 * - ✅ Instant availability - fonts load with CSS bundle
 * - ✅ Reduced latency - no DNS lookup or CDN roundtrip
 *
 * @param {ShadowRoot} shadowRoot - Shadow DOM root (unused, kept for API compatibility)
 * @returns {Promise<boolean>} Promise resolving to true (fonts available via CSS bundle)
 *
 * @deprecated This function is now a compatibility shim. Fonts are loaded automatically
 *   via the CSS bundle injected by injectCSSIntoShadow(). Will be removed in v2.0.
 *
 * @example
 * // Old usage (still works, but unnecessary)
 * await injectGoogleFontsIntoShadow(shadowRoot);
 *
 * // New usage (fonts automatically available after CSS injection)
 * const cssContent = await fetchCSSContent();
 * injectCSSIntoShadow(shadowRoot, cssContent);
 * // Fonts are ready - no additional steps needed
 */
export async function injectGoogleFontsIntoShadow(shadowRoot) {
  // Fonts are now bundled in index.css and loaded via injectCSSIntoShadow()
  // This function remains as a no-op for backward compatibility

  try {
    const startTime = performance.now();

    // Wait for fonts to be ready (they're loaded from the CSS bundle)
    await document.fonts.ready;

    // Verify bundled fonts loaded from CSS
    const daysOneLoaded = Array.from(document.fonts).some(
      (f) => f.family.includes("Days One") && f.status === "loaded"
    );
    const barlowLoaded = Array.from(document.fonts).some(
      (f) => f.family.includes("Barlow") && f.status === "loaded"
    );

    const endTime = performance.now();

    Logger.info("ShadowDOM", "Verified bundled fonts", {
      durationMs: Number((endTime - startTime).toFixed(2))
    });
    Logger.info("ShadowDOM", "Font availability (from CSS bundle)", {
      "Days One": daysOneLoaded ? "✅ loaded" : "⚠️ loading",
      Barlow: barlowLoaded ? "✅ loaded" : "⚠️ loading",
    });

    return true;
  } catch (error) {
    Logger.warn("ShadowDOM", "Font verification failed (non-critical)", error);

    // Font verification is non-critical - continue rendering
    // Fonts will load asynchronously from the CSS bundle
    return true;
  }
}

/**
 * Creates a complete Shadow DOM setup with CSS and bundled fonts
 *
 * @description
 * High-level convenience function that orchestrates the complete Shadow DOM
 * setup process:
 * 1. Creates Shadow DOM container with portal target
 * 2. Fetches and injects Tailwind CSS (includes bundled @font-face rules)
 * 3. Verifies font availability (fonts load automatically from CSS bundle)
 * 4. Returns complete setup ready for React rendering
 *
 * This is the recommended entry point for creating Shadow DOM modals.
 *
 * **Font Loading:**
 * Fonts (Days One, Barlow) are self-hosted and bundled in index.css via @font-face
 * rules. No external network requests are made - fonts load instantly from the
 * Chrome extension bundle.
 *
 * @param {string} [cssPath='index.css'] - Optional custom CSS path
 * @returns {Promise<{container: HTMLDivElement, shadowRoot: ShadowRoot, portalTarget: HTMLDivElement}>}
 *   Promise resolving to Shadow DOM setup object
 *
 * @throws {Error} If Shadow DOM creation or CSS injection fails
 *
 * @example
 * // Basic usage
 * const setup = await createShadowDOMWithStyles();
 * const { container, shadowRoot, portalTarget } = setup;
 *
 * // Render React into portalTarget
 * const root = createRoot(container);
 * root.render(<App portalTarget={portalTarget} />);
 *
 * // Cleanup
 * root.unmount();
 * container.remove();
 *
 * @example
 * // With custom CSS
 * const setup = await createShadowDOMWithStyles('custom/theme.css');
 */
export async function createShadowDOMWithStyles(cssPath = "index.css") {
  try {
    const totalStartTime = performance.now();

    // Step 1: Create Shadow DOM container
    const { container, shadowRoot, portalTarget } = createShadowDOMContainer();

    // Step 2: Fetch CSS content
    const cssContent = await fetchCSSContent(cssPath);

    // Step 3: Inject CSS (includes bundled fonts) and verify font availability
    await Promise.all([
      injectCSSIntoShadow(shadowRoot, cssContent),
      injectGoogleFontsIntoShadow(shadowRoot), // Now a verification no-op
    ]);

    const totalEndTime = performance.now();
    Logger.info("ShadowDOM", "Complete Shadow DOM setup finished", {
      durationMs: Number((totalEndTime - totalStartTime).toFixed(2))
    });

    return {
      container,
      shadowRoot,
      portalTarget,
    };
  } catch (error) {
    Logger.error("ShadowDOM", "Failed to create Shadow DOM with styles", error);
    throw error;
  }
}

/**
 * Clears the CSS cache (useful for development/testing)
 *
 * @description
 * Clears the in-memory CSS cache. This forces fresh CSS fetch on the
 * next Shadow DOM creation. Primarily useful for development, hot-reloading,
 * or testing scenarios.
 *
 * Note: Font cache is deprecated since fonts are now bundled in the CSS file.
 *
 * @example
 * // Clear cache to force fresh CSS load
 * clearShadowDOMCache();
 * const setup = await createShadowDOMWithStyles(); // Will fetch fresh CSS
 */
export function clearShadowDOMCache() {
  cachedCSS = null;
  cachedFonts = null; // Deprecated but kept for compatibility
  Logger.info("ShadowDOM", "Cleared Shadow DOM CSS cache");
}
