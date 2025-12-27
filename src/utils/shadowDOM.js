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

/**
 * CSS content cache for performance optimization
 * @type {string|null}
 * @private
 */
let cachedCSS = null;

/**
 * Google Fonts CSS cache for performance optimization
 * @type {string|null}
 * @private
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
  const container = document.createElement('div');
  container.id = 'justui-external-link-modal-root';

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
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Create portal target div inside Shadow DOM
  // This is where React will render the modal content
  const portalTarget = document.createElement('div');
  portalTarget.className = 'shadow-content';

  // Enable pointer events on the portal target (clicks will work normally)
  portalTarget.style.cssText = `
    pointer-events: auto;
    width: 100%;
    height: 100%;
  `;

  shadowRoot.appendChild(portalTarget);

  // Append container to document body
  document.body.appendChild(container);

  console.log('OriginalUI: Created Shadow DOM container with portal target');

  return {
    container,
    shadowRoot,
    portalTarget
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
 * console.log(`Loaded ${cssContent.length} bytes of CSS`);
 *
 * @example
 * // Custom CSS file
 * const customCSS = await fetchCSSContent('styles/custom.css');
 */
export async function fetchCSSContent(cssPath = 'index.css') {
  // Return cached CSS if available
  if (cachedCSS) {
    console.log('OriginalUI: Using cached CSS content');
    return cachedCSS;
  }

  try {
    // Validate Chrome runtime availability
    if (!chrome?.runtime?.getURL) {
      throw new Error('Chrome runtime API unavailable');
    }

    // Get CSS file URL from Chrome extension
    const cssURL = chrome.runtime.getURL(cssPath);
    console.log('OriginalUI: Fetching CSS from', cssURL);

    // Fetch CSS content
    const startTime = performance.now();
    const response = await fetch(cssURL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    cachedCSS = await response.text();
    const endTime = performance.now();

    console.log(`OriginalUI: Fetched ${cachedCSS.length} bytes of CSS in ${(endTime - startTime).toFixed(2)}ms`);

    return cachedCSS;

  } catch (error) {
    console.error('OriginalUI: Failed to fetch CSS content:', error);
    throw error;
  }
}

/**
 * Injects CSS content into Shadow DOM as inline <style> element
 *
 * @description
 * Creates a <style> element with the provided CSS content and appends it to
 * the Shadow DOM root. This provides complete CSS isolation from the host page.
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
 * // Later: styleElement.remove() to clean up
 *
 * @example
 * // Custom CSS
 * const customCSS = '.modal { background: blue; }';
 * injectCSSIntoShadow(shadowRoot, customCSS);
 */
export function injectCSSIntoShadow(shadowRoot, cssContent) {
  if (!shadowRoot || !(shadowRoot instanceof ShadowRoot)) {
    throw new Error('Invalid Shadow DOM root provided');
  }

  if (typeof cssContent !== 'string' || cssContent.length === 0) {
    throw new Error('CSS content must be a non-empty string');
  }

  try {
    const startTime = performance.now();

    // Create style element
    const styleElement = document.createElement('style');
    styleElement.textContent = cssContent;

    // Add identifier for debugging
    styleElement.setAttribute('data-justui-style', 'tailwind');

    // Inject into Shadow DOM
    shadowRoot.appendChild(styleElement);

    const endTime = performance.now();
    console.log(`OriginalUI: Injected ${cssContent.length} bytes of CSS into Shadow DOM in ${(endTime - startTime).toFixed(2)}ms`);

    return styleElement;

  } catch (error) {
    console.error('OriginalUI: Failed to inject CSS into Shadow DOM:', error);
    throw error;
  }
}

/**
 * Injects Google Fonts CSS into Shadow DOM with fallback handling
 *
 * @description
 * Fetches Google Fonts CSS and injects it inline into the Shadow DOM. This
 * ensures fonts are available within the isolated Shadow DOM context.
 *
 * The function:
 * 1. Fetches Google Fonts CSS from Google's servers
 * 2. Injects the CSS inline into Shadow DOM (includes @font-face rules)
 * 3. Waits for fonts to load using document.fonts.ready API
 * 4. Falls back gracefully to system fonts if loading fails
 *
 * Font loading errors are non-critical and will not prevent modal rendering.
 *
 * @param {ShadowRoot} shadowRoot - Shadow DOM root to inject fonts into
 * @returns {Promise<HTMLStyleElement|null>} Promise resolving to style element,
 *   or null if font loading failed (system fonts will be used)
 *
 * @example
 * const fontStyle = await injectGoogleFontsIntoShadow(shadowRoot);
 * if (fontStyle) {
 *   console.log('Google Fonts loaded successfully');
 * } else {
 *   console.log('Using system font fallback');
 * }
 */
/**
 * Global flag to track if fonts have been injected into document head
 * Fonts only need to be loaded once per page, then they're available everywhere
 */
let fontsInjectedGlobally = false;

export async function injectGoogleFontsIntoShadow(shadowRoot) {
  // Don't need shadowRoot parameter anymore since we inject globally
  // But keep it for API compatibility

  // If fonts already injected globally, skip
  if (fontsInjectedGlobally) {
    console.log('OriginalUI: Google Fonts already loaded globally');
    return true;
  }

  try {
    const startTime = performance.now();

    // Google Fonts URL for Days One and Barlow
    const fontURL = 'https://fonts.googleapis.com/css2?family=Days+One&family=Barlow:wght@100;200;300;400;500;600;700;800;900&display=swap';

    console.log('OriginalUI: Loading Google Fonts globally for Shadow DOM compatibility');
    console.log('OriginalUI: Fetching from', fontURL);

    // Fetch Google Fonts CSS
    const response = await fetch(fontURL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const fontCSS = await response.text();

    console.log('OriginalUI: Fetched', fontCSS.length, 'bytes of Google Fonts CSS');

    // Inject into document head (not Shadow DOM) to make fonts globally available
    const styleElement = document.createElement('style');
    styleElement.textContent = fontCSS;
    styleElement.setAttribute('data-justui-fonts', 'google-fonts-global');

    // Inject into document head
    document.head.appendChild(styleElement);

    // Wait for fonts to load
    await document.fonts.ready;

    // Verify fonts loaded
    const daysOneLoaded = Array.from(document.fonts).some(
      f => f.family.includes('Days One') && f.status === 'loaded'
    );
    const barlowLoaded = Array.from(document.fonts).some(
      f => f.family.includes('Barlow') && f.status === 'loaded'
    );

    const endTime = performance.now();
    console.log(`OriginalUI: Loaded Google Fonts globally in ${(endTime - startTime).toFixed(2)}ms`);
    console.log('OriginalUI: Font availability:', {
      'Days One': daysOneLoaded ? '✅ loaded' : '❌ failed',
      'Barlow': barlowLoaded ? '✅ loaded' : '❌ failed'
    });

    // Mark as injected so we don't do it again
    fontsInjectedGlobally = true;

    return { daysOneLoaded, barlowLoaded };

  } catch (error) {
    console.error('OriginalUI: Failed to load Google Fonts globally (falling back to system fonts):', error);

    // Font loading is non-critical - continue without custom fonts
    // System font stack will be used as fallback
    return null;
  }
}

/**
 * Creates a complete Shadow DOM setup with CSS and fonts injected
 *
 * @description
 * High-level convenience function that orchestrates the complete Shadow DOM
 * setup process:
 * 1. Creates Shadow DOM container with portal target
 * 2. Fetches and injects Tailwind CSS
 * 3. Fetches and injects Google Fonts (parallel with CSS)
 * 4. Returns complete setup ready for React rendering
 *
 * This is the recommended entry point for creating Shadow DOM modals.
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
export async function createShadowDOMWithStyles(cssPath = 'index.css') {
  try {
    const totalStartTime = performance.now();

    // Step 1: Create Shadow DOM container
    const { container, shadowRoot, portalTarget } = createShadowDOMContainer();

    // Step 2: Fetch CSS content
    const cssContent = await fetchCSSContent(cssPath);

    // Step 3: Inject CSS and fonts in parallel for performance
    await Promise.all([
      injectCSSIntoShadow(shadowRoot, cssContent),
      injectGoogleFontsIntoShadow(shadowRoot)
    ]);

    const totalEndTime = performance.now();
    console.log(`OriginalUI: Complete Shadow DOM setup finished in ${(totalEndTime - totalStartTime).toFixed(2)}ms`);

    return {
      container,
      shadowRoot,
      portalTarget
    };

  } catch (error) {
    console.error('OriginalUI: Failed to create Shadow DOM with styles:', error);
    throw error;
  }
}

/**
 * Clears the CSS and font caches (useful for development/testing)
 *
 * @description
 * Clears the in-memory CSS and font caches. This forces fresh fetches on the
 * next Shadow DOM creation. Primarily useful for development, hot-reloading,
 * or testing scenarios.
 *
 * @example
 * // Clear caches to force fresh CSS load
 * clearShadowDOMCache();
 * const setup = await createShadowDOMWithStyles(); // Will fetch fresh CSS
 */
export function clearShadowDOMCache() {
  cachedCSS = null;
  cachedFonts = null;
  console.log('OriginalUI: Cleared Shadow DOM CSS and font caches');
}
