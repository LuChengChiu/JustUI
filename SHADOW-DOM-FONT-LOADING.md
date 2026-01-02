# Shadow DOM Font Loading in Chrome Extensions

**Problem**: Custom fonts fail to load in Navigation Guardian modal (Shadow DOM)
**Root Cause**: Chrome blocks font loading from `chrome-extension://` URLs when @font-face rules are defined inside Shadow DOM
**Solution**: Inject @font-face rules into main document `<head>` instead of Shadow DOM

---

## Table of Contents

1. [Problem History](#problem-history)
2. [Symptoms](#symptoms)
3. [Root Cause Analysis](#root-cause-analysis)
4. [What Doesn't Work (And Why)](#what-doesnt-work-and-why)
5. [Working Solution](#working-solution)
6. [Implementation Details](#implementation-details)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## Problem History

This issue has occurred **multiple times** with the Navigation Guardian modal. Each time, fonts fail to render correctly despite being:
- ✅ Bundled in the extension (`dist/*.ttf`)
- ✅ Listed in `manifest.json` web_accessible_resources
- ✅ Referenced in CSS with @font-face rules

**Previous Attempts:**
1. **Attempt 1**: Used Google Fonts CDN → Worked but introduced privacy/CSP issues
2. **Attempt 2**: Self-hosted fonts with relative URLs → URLs resolved to page domain instead of extension
3. **Attempt 3**: URL rewriting to `chrome-extension://` → Fonts still didn't load
4. **Attempt 4**: Used `<link>` instead of inline `<style>` → Still blocked
5. **Final Solution**: Inject fonts into main document `<head>` → **SUCCESS** ✅

---

## Symptoms

When fonts fail to load in the modal, you'll see:

### Visual Symptoms
- Modal text uses **serif fallback fonts** (Georgia, Times New Roman) instead of Barlow (sans-serif)
- Title text doesn't have the distinctive "Days One" blocky appearance
- Text appears less polished and professional

### Console Logs
```javascript
OriginalUI: Font availability (from CSS bundle): {
  "Days One": "⚠️ loading",  // Not "✅ loaded"
  "Barlow": "⚠️ loading"
}
```

### Network Tab
- **Zero .ttf font file requests** even though @font-face rules exist
- Only `index.css` is loaded, no font files

### DevTools Inspection
```javascript
// Computed styles show font-family is set correctly
getComputedStyle(element).fontFamily
// "Barlow, sans-serif"

// But document.fonts shows fonts as "unloaded" or "loading"
document.fonts.forEach(f => console.log(f.family, f.status))
// "Barlow" "unloaded"  ❌
```

---

## Root Cause Analysis

### The Core Issue

**Chrome blocks font loading from `chrome-extension://` URLs when @font-face rules are defined inside Shadow DOM.**

This is a security/isolation feature in Chromium to prevent:
1. Extension resources from being accessed by arbitrary web pages
2. Cross-origin font loading vulnerabilities
3. Shadow DOM CSS from breaking page isolation

### Technical Deep Dive

When @font-face rules are defined **inside Shadow DOM**:

```javascript
// ❌ DOESN'T WORK: @font-face in Shadow DOM
const shadowRoot = container.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = `
  @font-face {
    font-family: "Barlow";
    src: url("chrome-extension://[id]/barlow-regular.ttf") format("truetype");
  }
`;
shadowRoot.appendChild(style);
// Browser NEVER requests the font file!
```

**Why it fails:**
1. Shadow DOM CSS is isolated from main document
2. Browser's font loading mechanism doesn't recognize chrome-extension:// URLs in isolated contexts
3. Fonts are registered in `document.fonts` but never actually downloaded
4. Elements fall back to system fonts

### URL Resolution in Shadow DOM

| Context | Relative URL | Resolves To | Works? |
|---------|-------------|-------------|--------|
| **Inline `<style>` in Shadow DOM** | `url(./font.ttf)` | `https://page.com/font.ttf` | ❌ |
| **Inline `<style>` in Shadow DOM** | `url(chrome-extension://[id]/font.ttf)` | `chrome-extension://[id]/font.ttf` | ❌ (Blocked!) |
| **`<link>` in Shadow DOM** | `url(./font.ttf)` | `chrome-extension://[id]/font.ttf` | ❌ (Blocked!) |
| **`<style>` in document `<head>`** | `url(chrome-extension://[id]/font.ttf)` | `chrome-extension://[id]/font.ttf` | ✅ **WORKS!** |

---

## What Doesn't Work (And Why)

### ❌ Approach 1: Inline `<style>` with Relative URLs

```javascript
const style = document.createElement('style');
style.textContent = cssContent; // Contains url(./barlow-regular.ttf)
shadowRoot.appendChild(style);
```

**Why it fails**: Relative URLs resolve to page domain (`https://example.com/barlow-regular.ttf`), not extension

---

### ❌ Approach 2: URL Rewriting to Absolute chrome-extension:// URLs

```javascript
const rewrittenCSS = cssContent.replace(
  /url\(\.\/([^)]+\.ttf)\)/g,
  `url(chrome-extension://[id]/$1)`
);
shadowRoot.appendChild(style);
```

**Why it fails**: Even with correct URLs, Chrome blocks font loading from chrome-extension:// in Shadow DOM

---

### ❌ Approach 3: Using `<link>` Instead of Inline `<style>`

```javascript
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('index.css');
shadowRoot.appendChild(link);
```

**Why it fails**: CSS loads successfully, but @font-face rules inside still can't trigger font downloads in Shadow DOM context

---

### ❌ Approach 4: Constructable Stylesheets

```javascript
const sheet = new CSSStyleSheet();
sheet.replaceSync(cssContent);
shadowRoot.adoptedStyleSheets = [sheet];
```

**Why it fails**: Same Shadow DOM isolation issue - fonts don't load from chrome-extension:// URLs

---

## Working Solution

### ✅ Inject @font-face into Main Document `<head>`

**Key Insight**: Fonts defined in the main document are accessible globally, including to Shadow DOM elements!

```javascript
// Step 1: Inject fonts into main document <head>
function injectFontsIntoDocument() {
  if (document.getElementById('originalui-fonts')) return; // Already injected

  const fontStyle = document.createElement('style');
  fontStyle.id = 'originalui-fonts';
  fontStyle.textContent = `
    @font-face {
      font-family: "Barlow";
      src: url("${chrome.runtime.getURL('barlow-regular.ttf')}") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    /* ... other font weights ... */
  `;
  document.head.appendChild(fontStyle);
}

// Step 2: Create Shadow DOM
const shadowRoot = container.attachShadow({ mode: 'open' });

// Step 3: Set font-family in Shadow DOM styles
const baseStyle = document.createElement('style');
baseStyle.textContent = `
  :host, .shadow-content {
    font-family: Barlow, system-ui, sans-serif;
  }
`;
shadowRoot.appendChild(baseStyle);
```

**Why it works**:
1. ✅ @font-face in main document can load from chrome-extension:// URLs
2. ✅ Fonts are registered globally in `document.fonts`
3. ✅ Shadow DOM elements can **use** globally-defined fonts via font-family property
4. ✅ Browser downloads font files when Shadow DOM elements reference them

---

## Implementation Details

### File: `src/utils/shadow-dom.js`

#### Function 1: `injectFontsIntoDocument()`

```javascript
/**
 * Injects font @font-face rules into main document head
 *
 * CRITICAL: Shadow DOM blocks font loading from chrome-extension:// URLs.
 * Solution: Inject @font-face rules into main document <head> instead.
 * Fonts defined globally in main document are accessible to Shadow DOM elements.
 */
export function injectFontsIntoDocument() {
  // Prevent duplicate injection
  if (document.getElementById('originalui-fonts')) {
    return false;
  }

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

    /* Barlow Font Family (9 weights: 100-900) */
    @font-face {
      font-family: "Barlow";
      src: url("${chrome.runtime.getURL('barlow-regular.ttf')}") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    /* ... 8 more Barlow weights ... */
  `;

  document.head.appendChild(fontStyle);
  console.log('OriginalUI: Injected fonts into document <head>');
  return true;
}
```

**Key Points**:
- Uses `chrome.runtime.getURL()` to generate absolute chrome-extension:// URLs
- Only runs once per page (idempotent via ID check)
- Includes all font weights needed by the application
- Uses `font-display: swap` for better UX (shows fallback while loading)

---

#### Function 2: `injectBaseShadowStyles()`

```javascript
/**
 * Injects base typography styles into Shadow DOM
 * Sets font-family to use globally-loaded fonts
 */
export function injectBaseShadowStyles(shadowRoot) {
  const baseStyleElement = document.createElement('style');
  baseStyleElement.setAttribute('data-justui-style', 'shadow-base');
  baseStyleElement.textContent = `
    :host, .shadow-content {
      font-family: Barlow, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #111827;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
  `;

  shadowRoot.insertBefore(baseStyleElement, shadowRoot.firstChild);
  return baseStyleElement;
}
```

**Key Points**:
- Sets `font-family: Barlow` to activate globally-loaded fonts
- Includes fallback fonts for robustness
- Injects at beginning so Tailwind classes can override
- Uses `:host` to style Shadow DOM root

---

### File: `src/components/external-link-modal.jsx`

```javascript
const setupModal = async () => {
  // Step 1: Inject fonts into main document <head> (global scope)
  injectFontsIntoDocument();

  // Step 2: Create Shadow DOM container
  const { container, shadowRoot, portalTarget } = createShadowDOMContainer();

  // Step 3: Inject base Shadow DOM typography styles
  injectBaseShadowStyles(shadowRoot);

  // Step 4: Inject CSS via <link> element
  await injectCSSIntoShadow(shadowRoot);

  // Step 5: Render React modal
  const root = createRoot(container);
  root.render(<ExternalLinkModal ... />);
};
```

**Execution Order**:
1. **Fonts first** - Inject into document head
2. **Shadow DOM** - Create isolated container
3. **Base styles** - Set font-family in Shadow DOM
4. **Tailwind CSS** - Load utility classes
5. **React render** - Mount modal component

---

## Testing & Verification

### 1. Build and Load Extension

```bash
npm run build
# Load dist/ folder in chrome://extensions
```

### 2. Trigger Navigation Guardian Modal

Navigate to any page and click a cross-origin link to trigger the modal.

### 3. Verify Font Injection

**DevTools Console:**

```javascript
// Check if fonts were injected into document head
const fontStyle = document.getElementById('originalui-fonts');
console.log('Font style exists:', !!fontStyle);

// Check font content
console.log(fontStyle.textContent.substring(0, 200));
// Should show: @font-face { font-family: "Days One"; src: url("chrome-extension://...")
```

### 4. Verify Font Loading

```javascript
// Check document.fonts API
const fonts = [];
document.fonts.forEach(f => {
  if (f.family.includes('Barlow') || f.family.includes('Days')) {
    fonts.push({ family: f.family, weight: f.weight, status: f.status });
  }
});
console.table(fonts);

// Expected output:
// family      | weight | status
// ------------|--------|--------
// "Barlow"    | "400"  | "loaded"   ✅
// "Days One"  | "400"  | "loaded"   ✅
```

### 5. Verify Visual Rendering

**Expected**:
- Modal title uses **Days One** font (distinctive blocky appearance)
- Body text uses **Barlow** font (clean, modern sans-serif)
- Buttons use **Days One** font

**If fonts fail**:
- Text appears in serif font (Georgia, Times New Roman)
- Title doesn't have blocky Days One appearance

### 6. Check Network Tab

**Note**: With this solution, font files might NOT appear in Network tab because:
1. Fonts are loaded lazily (only when used)
2. Browser may cache @font-face registration separately
3. `font-display: swap` allows rendering before font loads

**To force font loading:**

```javascript
// In DevTools Console
const testDiv = document.createElement('div');
testDiv.style.fontFamily = 'Barlow';
testDiv.style.fontWeight = '700';
testDiv.textContent = 'Test Barlow Bold';
document.body.appendChild(testDiv);

// Check Network tab - you should see barlow-bold.ttf requested
```

---

## Troubleshooting Guide

### Issue: Fonts showing as "unloaded" or "loading"

**Check**:
```javascript
document.getElementById('originalui-fonts')
```

**If null**: Font injection function didn't run
- **Fix**: Ensure `injectFontsIntoDocument()` is called before Shadow DOM creation

**If exists**: @font-face rules are registered but fonts not used yet
- **Fix**: Verify `font-family: Barlow` is set in Shadow DOM base styles

---

### Issue: Modal still shows serif fonts

**Check computed styles**:
```javascript
const modal = document.querySelector('#originalui-external-link-modal-root');
const text = modal.shadowRoot.querySelector('p');
getComputedStyle(text).fontFamily;
```

**If shows system fonts**: Base styles not applied
- **Fix**: Ensure `injectBaseShadowStyles()` is called and injects `:host { font-family: Barlow }`

**If shows "Barlow, sans-serif"**: Fonts registered but not loading
- **Fix**: Check `manifest.json` web_accessible_resources includes all .ttf files

---

### Issue: Build fails with "font not found"

**Check**:
```bash
ls dist/*.ttf
# Should show all 10 font files
```

**If missing**: Vite build config issue
- **Fix**: Verify `vite.config.js` copies fonts to dist/

**Check manifest**:
```bash
grep "\.ttf" dist/manifest.json
```

**If missing**: Update `src/manifest.json` web_accessible_resources

---

### Issue: Fonts load on first modal but fail on subsequent modals

**Cause**: `injectFontsIntoDocument()` should be idempotent

**Check**:
```javascript
// Should return false on subsequent calls (already exists)
injectFontsIntoDocument();
```

**Fix**: Function already includes duplicate check via `getElementById('originalui-fonts')`

---

### Issue: Fonts work locally but fail in production

**Check extension ID**:
```javascript
console.log(chrome.runtime.id);
// Extension ID changes between local/production
```

**Check URLs**:
```javascript
console.log(chrome.runtime.getURL('barlow-regular.ttf'));
// Should show chrome-extension://[current-id]/barlow-regular.ttf
```

**Fix**: URLs are generated dynamically, should work automatically

---

## Best Practices

### 1. Always Inject Fonts Before Shadow DOM Creation

```javascript
// ✅ CORRECT ORDER
injectFontsIntoDocument();        // 1. Fonts first (global)
createShadowDOMContainer();       // 2. Shadow DOM
injectBaseShadowStyles(shadowRoot); // 3. Set font-family

// ❌ WRONG ORDER
createShadowDOMContainer();
injectBaseShadowStyles(shadowRoot);
injectFontsIntoDocument();        // Too late! Elements already rendered
```

### 2. Use font-display: swap

```css
@font-face {
  font-family: "Barlow";
  src: url("...");
  font-display: swap;  /* Show fallback immediately, swap when font loads */
}
```

**Benefits**:
- Better perceived performance
- No FOIT (Flash of Invisible Text)
- Graceful degradation

### 3. Include Fallback Fonts

```css
:host {
  /* ✅ GOOD: Include fallbacks */
  font-family: Barlow, system-ui, -apple-system, sans-serif;

  /* ❌ BAD: No fallbacks */
  font-family: Barlow;
}
```

### 4. Lazy Load Non-Critical Font Weights

Only include frequently-used weights in initial @font-face:
- Barlow 400 (regular) ✅ Always load
- Barlow 700 (bold) ✅ Always load
- Barlow 100-300, 800-900 ⚠️ Load on demand if needed

---

## Related Issues

### Google Fonts CDN Approach (Deprecated)

**Previous implementation** fetched fonts from googleapis.com:

```javascript
// ❌ OLD APPROACH (deprecated)
const link = document.createElement('link');
link.href = 'https://fonts.googleapis.com/css2?family=Barlow:wght@100;200;...';
link.rel = 'stylesheet';
shadowRoot.appendChild(link);
```

**Problems**:
- Privacy concern (Google tracks font requests)
- CSP violations on some pages
- Network overhead on every page load
- Offline incompatibility

**Why it worked**: googleapis.com URLs are not blocked by Shadow DOM isolation

---

## Summary

### The Problem
Custom fonts fail to load in Shadow DOM when using chrome-extension:// URLs

### The Solution
Inject @font-face rules into main document `<head>` instead of Shadow DOM

### Key Files Modified
1. `src/utils/shadow-dom.js` - Added `injectFontsIntoDocument()`
2. `src/components/external-link-modal.jsx` - Call fonts injection first

### Verification
- ✅ Fonts show `status: "loaded"` in `document.fonts`
- ✅ Modal renders with Barlow (sans-serif) instead of serif fallback
- ✅ No console errors or network failures

---

## Future-Proofing

If this issue occurs again:

1. **Check this document first** - The solution is documented here
2. **Verify execution order** - Fonts must be injected before Shadow DOM creation
3. **Check browser console** - Look for font injection confirmation log
4. **Inspect document.fonts** - Verify fonts show as "loaded"
5. **Check computed styles** - Ensure font-family is set correctly

**DO NOT**:
- ❌ Try to inject fonts into Shadow DOM (never works)
- ❌ Use Google Fonts CDN (privacy/CSP issues)
- ❌ Rewrite URLs to chrome-extension:// in Shadow DOM CSS (blocked by browser)

**DO**:
- ✅ Always inject fonts into main document `<head>`
- ✅ Use `chrome.runtime.getURL()` for absolute URLs
- ✅ Set font-family in Shadow DOM base styles
- ✅ Include fallback fonts for robustness

---

**Last Updated**: 2026-01-02
**Issue Resolution**: Complete ✅
**Tested**: Chrome 143.0.7499.170 on macOS 15.7.1
