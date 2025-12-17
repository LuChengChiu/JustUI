# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JustUI is a comprehensive Chrome Extension built with React 19, Vite 7, and Tailwind CSS 4. It provides advanced web protection through multiple defensive systems:

1. **Element Removal System** - Removes unwanted DOM elements (ads, trackers, etc.) using CSS selectors
2. **Navigation Guardian** - Intercepts and blocks malicious cross-origin navigation attempts with user confirmation modals  
3. **Advanced Pattern Detection** - AI-powered ad detection engine using pattern analysis
4. **Whitelist Management** - Clean domains that are exempt from all protection systems

The extension operates on all domains EXCEPT those in the whitelist, providing comprehensive protection against ads, trackers, pop-unders, malicious redirects, and other unwanted content.

## Commands

- `npm run dev` - Start Vite dev server
- `npm run build` - Build extension to `dist/` directory
- `npm run preview` - Preview production build

## Architecture

**Core Functionality:**
1. **Main Toggle** - Enable/disable entire extension functionality
2. **Element Removal System** - CSS selector-based element removal with default/custom rules
3. **Navigation Guardian** - Cross-origin navigation interception with user confirmation modals
4. **Advanced Pattern Detection** - AI-powered ad detection using behavioral analysis
5. **Whitelist System** - Manage clean domains that are EXEMPT from all protection systems (trusted sites)
6. **Statistics & Analytics** - Real-time tracking of blocked elements and navigation attempts
7. **Settings Management** - Comprehensive user configuration interface

**Chrome Extension Structure:**
- `manifest.json` - Chrome Extension Manifest V3 configuration
- `popup.html` - Extension popup entry point (renders to `#popup-root`)
- `settings.html` - Settings page for whitelist and rule management
- `src/popup.jsx` - React entry point
- `src/App.jsx` - Main popup component with toggle, domain status, and quick actions
- `src/settings.jsx` - Settings page React component
- `src/components/ui/` - Reusable UI components
- `src/scripts/content.js` - Content script for DOM manipulation
- `src/scripts/background.js` - Service worker for extension coordination

**Data Storage Schema:**
```javascript
{
  isActive: boolean,                    // Main extension toggle
  whitelist: string[],                  // Clean domains EXEMPT from all protection: ['example.com', 'google.com']
  defaultRules: Rule[],                 // Built-in element removal rules
  customRules: Rule[],                  // User-defined rules
  defaultRulesEnabled: boolean,         // Toggle for default rules
  customRulesEnabled: boolean,          // Toggle for custom rules
  patternRulesEnabled: boolean,         // Toggle for AI pattern detection
  navigationGuardEnabled: boolean,      // Toggle for Navigation Guardian
  navigationStats: {                    // Navigation Guardian statistics
    blockedCount: number,               // Total blocked navigation attempts
    allowedCount: number                // Total allowed navigation attempts
  },
  domainStats: {                        // Per-domain removal statistics (session-only)
    [domain]: {
      defaultRulesRemoved: number,
      customRulesRemoved: number
    }
  }
}
```

**Rule Schema:**
```javascript
{
  id: string,                          // Unique identifier
  selector: string,                    // CSS selector for elements
  description: string,                 // Human-readable description
  confidence: 'high' | 'medium' | 'low', // Rule confidence level
  domains: string[],                   // ['*'] for all domains or specific domains
  category: string,                    // 'advertising', 'tracking', etc.
  enabled: boolean                     // Individual rule toggle
}
```

**Navigation Guardian System:**
Navigation Guardian provides comprehensive protection against malicious cross-origin navigation attempts through multiple interception layers:

1. **JavaScript Navigation Overrides** (`src/scripts/injected-script.js`):
   - Intercepts `window.open()` - Blocks pop-unders and malicious pop-ups
   - Intercepts `location.href` assignments - Blocks programmatic redirects
   - Intercepts `location.assign()` and `location.replace()` - Complete coverage
   - Runs in page's main world for deep JavaScript interception

2. **DOM Event Interception** (`src/scripts/content.js`):
   - Link click interception (`<a>` tags) with href analysis
   - Form submission interception for cross-origin form attacks
   - Event capture phase interception for early prevention

3. **User Confirmation Modal**:
   - Professional modal UI with URL display (XSS-safe)
   - Block/Allow buttons with keyboard shortcuts (ESC=Block, Enter=Allow)
   - Automatic statistics tracking and storage sync

4. **Whitelist Integration**:
   - Trusted domains bypass all Navigation Guardian checks
   - Reuses existing whitelist infrastructure for consistency

**Component Responsibilities:**

*Popup (src/App.jsx):*
- Main extension toggle
- Current domain whitelist status (shows if domain is exempt from all protection systems)
- "Add to whitelist" button (when domain is NOT whitelisted - to mark it as clean/trusted)
- "Remove from whitelist" button (when domain IS whitelisted - to enable protection again)
- Element removal statistics and indicators
- Navigation Guardian statistics (blocked/allowed counts)
- Settings page navigation

*Settings Page (src/settings.jsx):*
- Whitelist CRUD operations
- Default rules toggle panel with individual rule controls
- Custom rule editor with form validation
- Pattern detection (AI) toggle controls
- Navigation Guardian toggle and statistics management
- Import/export functionality for rules and settings

*Content Script (src/scripts/content.js):*
- Monitor DOM for targeted elements using CSS selectors and AI patterns
- Execute active rules based on current domain and whitelist status
- Remove elements matching enabled rule selectors
- Navigation Guardian: Intercept link clicks and form submissions
- Display confirmation modals for cross-origin navigation attempts
- Advanced pattern detection using AdDetectionEngine
- Communicate execution results and statistics to background script

*Background Script (src/scripts/background.js):*
- Coordinate popup ↔ content script communication
- Handle storage updates and synchronization
- Validate domains and rule execution permissions
- Manage extension lifecycle events

**Build System:**
- Vite builds to `dist/` with a custom plugin that copies `manifest.json` and `icons/` folder
- Uses relative base path (`./`) for Chrome extension compatibility
- PostCSS configured with `@tailwindcss/postcss` plugin

**Extension Permissions:**
- `activeTab` - Access to current tab for domain detection
- `storage` - Chrome storage API for persisting extension state
- `scripting` - Execute content scripts for DOM manipulation

## Development Guidelines

**Data Flow:**
1. User loads page → Content script checks if domain is whitelisted and extension is active
2. If active and NOT whitelisted → Execute enabled rules (default + custom)
3. Content script removes matching elements from DOM
4. If domain IS whitelisted → Skip element removal (domain is clean/trusted)
5. Popup displays current domain status and quick actions

**Element Removal Logic:**
- Extension must be active (`isActive = true`)
- Domain must NOT be in whitelist (whitelist = clean domains that don't need cleanup)
- At least one rule set must be enabled (defaultRules or customRules)
- Elements are removed when: `isActive && !isDomainWhitelisted(currentDomain)`

**Default Rules:**
Initialize extension with common element removal rules for advertising, tracking, and annoyances. Store in `defaultRules` array with categories like:
- `advertising` - Ad networks, sponsored content
- `tracking` - Analytics scripts, tracking pixels
- `social` - Social media widgets
- `popup` - Modal overlays, newsletter signups

**Default Whitelist:**
Initialize extension with common clean/trusted domains that DON'T need element removal. Store in `src/data/defaultWhitelist.json`:
- Trusted development tools and documentation sites
- Essential web services with clean UIs
- User-preferred sites without intrusive ads
- Users can add/remove domains as needed - these are just sensible defaults for clean sites

**Storage Keys:**
- `isActive` - Main extension toggle
- `whitelist` - Array of clean/trusted domains EXEMPT from element removal
- `defaultRules` - Built-in rules array
- `customRules` - User-created rules array
- `defaultRulesEnabled` - Boolean for default rules toggle
- `customRulesEnabled` - Boolean for custom rules toggle

**Domain Handling:**
- Extract domain from current tab URL using `new URL(tab.url).hostname`
- Support subdomain matching (e.g., `*.example.com`)
- Store domains without protocol (no `https://`)

**Testing Extension:**
1. Run `npm run build` to build to `dist/`
2. Open Chrome → Extensions → Developer mode → Load unpacked → Select `dist/` folder
3. Test popup, settings page, and content script functionality
4. Use Chrome DevTools → Console to debug content script
5. Use Extension DevTools to debug popup and background script
