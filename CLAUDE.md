# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OriginalUI is a comprehensive Chrome Extension built with React 19, Vite 7, and Tailwind CSS 4. It provides advanced web protection through multiple defensive systems:

1. **Element Removal System** - Removes unwanted DOM elements (ads, trackers, etc.) using CSS selectors
2. **Navigation Guardian** - Intercepts and blocks malicious cross-origin navigation attempts with user confirmation modals
3. **Network Request Blocking** - Block malicious domains and tracking requests at the network level
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
4. **Network Request Blocking** - Block malicious domains and tracking requests with configurable patterns
5. **Whitelist System** - Manage clean domains that are EXEMPT from all protection systems (trusted sites)
6. **Statistics & Analytics** - Real-time tracking of blocked elements and navigation attempts
7. **Settings Management** - Comprehensive user configuration interface with modular beta version

**Chrome Extension Structure:**
- `manifest.json` - Chrome Extension Manifest V3 configuration
- `popup.html` - Extension popup entry point (renders to `#popup-root`)
- `settings.html` - Settings page for whitelist and rule management
- `src/popup.jsx` - React entry point
- `src/App.jsx` - Main popup component with toggle, domain status, and quick actions
- `src/settings.jsx` - Settings page React component
- `src/settings-beta.jsx` - Modern beta settings page with modular components
- `settings-beta.html` - Entry point for beta settings interface
- `src/components/ui/` - Reusable UI components (buttons, inputs, typography, etc.)
- `src/components/settings/` - Modular settings components (whitelist, rules, navigation guardian, etc.)
- `src/data/` - Default configuration files (rules, whitelist, blocked domains)
- `src/scripts/content.js` - Modular content script orchestrator
- `src/scripts/modules/` - Protection modules (ScriptAnalyzer, NavigationGuardian, ClickHijackingProtector, etc.)
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
  navigationGuardEnabled: boolean,      // Toggle for Navigation Guardian
  defaultBlockRequestEnabled: boolean,  // Toggle for network request blocking
  networkBlockPatterns: string[],       // Custom network blocking patterns
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

2. **DOM Event Interception** (`src/scripts/modules/NavigationGuardian.js`):
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
- Navigation Guardian toggle and statistics management
- Network request blocking configuration
- Import/export functionality for rules and settings

*Beta Settings Page (src/settings-beta.jsx):*
- Modern modular interface with improved UX
- Component-based architecture using `/src/components/settings/`
- WhitelistManager, CustomRulesManager, NavigationGuardian, BlockRequestsManager components
- Enhanced visual design with Tailwind CSS styling
- Improved form validation and user feedback

*Content Script (src/scripts/content.js):*
- **OriginalUIController**: Main orchestrator coordinating all protection modules with comprehensive cleanup management
- **ScriptAnalyzer**: Advanced script threat detection and real-time monitoring
- **NavigationGuardian**: Cross-origin navigation interception with user confirmation modals
- **ClickHijackingProtector**: Advanced click analysis and suspicious overlay detection
- **ElementRemover**: DOM element removal with multiple strategies (hide, remove, neutralize)
- **RequestBlockingProtector**: Request interception and blocking capabilities
- **CleanupRegistry**: Centralized cleanup management for memory leak prevention
- **Chrome API Safety**: Robust Chrome storage operations with context validation and retry mechanisms
- Communicate execution results and statistics to background script

*Modular Protection System:*
- Each protection system operates independently and can be enabled/disabled
- Modules communicate through well-defined interfaces
- Centralized configuration and lifecycle management
- Real-time threat analysis and user notification

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
1. User loads page → OriginalUIController loads settings FIRST (whitelist check before any protections)
2. If domain IS whitelisted OR extension inactive → Skip all protections, only setup message listeners
3. If active and NOT whitelisted → Activate ScriptAnalyzer and all protection modules
4. NavigationGuardian monitors cross-origin navigation attempts
5. ClickHijackingProtector analyzes and blocks suspicious clicks
6. Execute enabled rule modules (default + custom + EasyList)
7. Popup displays current domain status and comprehensive protection statistics

**Protection System Logic:**
- Extension must be active (`isActive = true`)
- Domain must NOT be in whitelist (whitelist = clean domains that don't need any protection)
- Individual protection modules can be enabled/disabled independently
- **ScriptAnalyzer**: Monitors and blocks malicious scripts in real-time
- **NavigationGuardian**: Protects against cross-origin navigation attacks
- **Element Removal**: Executes when `isActive && !isDomainWhitelisted(currentDomain)`

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

**Network Request Blocking:**
Block malicious domains and tracking requests at the network level. Store in `src/data/defaultBlockRequests.json`:
- Tracking domains (doubleclick.net, google-analytics.com)
- Malicious ad networks (adexchangeclear.com, pubfuture-ad.com)
- Cryptojacking sites (coin-hive.com)
- Analytics and telemetry services (api.segment.io)
- Support for regex patterns and multiple resource types (xmlhttprequest, script, iframe, etc.)

**Storage Keys:**
- `isActive` - Main extension toggle
- `whitelist` - Array of clean/trusted domains EXEMPT from element removal
- `defaultRules` - Built-in rules array
- `customRules` - User-created rules array
- `defaultRulesEnabled` - Boolean for default rules toggle
- `customRulesEnabled` - Boolean for custom rules toggle
- `navigationGuardEnabled` - Boolean for Navigation Guardian toggle
- `defaultBlockRequestEnabled` - Boolean for network blocking toggle
- `networkBlockPatterns` - Array of custom network blocking patterns
- `navigationStats` - Navigation Guardian statistics (blocked/allowed counts)

**Domain Handling:**
- Extract domain from current tab URL using `new URL(tab.url).hostname`
- Support subdomain matching (e.g., `*.example.com`)
- Store domains without protocol (no `https://`)

**Modular Architecture:**

The content script uses a clean modular architecture with specialized protection modules:

```
src/scripts/
├── content.js                         // OriginalUIController orchestrator
├── constants.js                       // Shared constants and performance tuning parameters
├── modules/
│   ├── ScriptAnalyzer.js              // Real-time script threat analysis
│   ├── NavigationGuardian.js          // Cross-origin navigation protection (modular orchestrator)
│   ├── navigation-guardian/           // NavigationGuardian modular components
│   │   ├── SecurityValidator.js       // URL security validation and threat analysis
│   │   ├── ModalManager.js            // UI modal creation and management
│   │   └── NavigationGuardian.original.js // Original monolithic version (backup)
│   ├── click-hijacking-protector.js     // Click analysis and overlay detection
│   ├── ElementRemover.js              // DOM manipulation strategies
│   ├── RequestBlockingProtector.js    // Request interception and blocking
│   └── ICleanable.js                  // Cleanup interface and registry for memory leak prevention
├── utils/
│   └── chrome-api-safe.js               // Safe Chrome API operations with context validation
└── injected-script.js                 // Page-world JavaScript interception
```

**Module Benefits:**
- **Single Responsibility**: Each module handles one specific protection area
- **Independent Testing**: Modules can be tested and debugged in isolation
- **Flexible Configuration**: Individual modules can be enabled/disabled
- **Easy Extensibility**: New protection features can be added as separate modules
- **Maintainable Code**: Clear separation of concerns and well-defined interfaces
- **Memory Leak Prevention**: Comprehensive cleanup system with ICleanable interface and CleanupRegistry
- **Performance Optimization**: Time-sliced execution and adaptive processing for optimal resource usage

**Cleanup Architecture:**

The extension implements a comprehensive cleanup system to prevent memory leaks:

- **ICleanable Interface**: Standardized cleanup contract for all modules
- **CleanupRegistry**: Central registry managing module cleanup lifecycle
- **Automatic Lifecycle Management**: Comprehensive event handling for page navigation, extension reload, and context invalidation
- **Resource Monitoring**: Tracks cleanup success/failure for debugging and optimization
- **Graceful Degradation**: Safe operation even when Chrome extension context becomes invalid

**NavigationGuardian Modular Architecture:**

NavigationGuardian has been refactored from a monolithic 1100+ line module into a clean modular architecture:

**Core Components:**
- **NavigationGuardian.js** (~600 lines): Main orchestrator handling cross-origin navigation detection, event management, whitelist caching, and module coordination
- **SecurityValidator.js** (~200 lines): Stateless security validation module handling URL protocol validation, homograph attack detection, and threat pattern analysis
- **ModalManager.js** (~300 lines): UI modal management extending CleanableModule for XSS-safe element creation, user interaction handling, and proper cleanup

**Modular Benefits:**
- **Single Responsibility**: Each module focuses on one concern (Security, UI, or Core Navigation)
- **Enhanced Testability**: Modules can be unit tested in isolation with clean interfaces
- **Improved Maintainability**: 45% reduction in main file complexity (1100→600 lines)
- **Performance Optimized**: Only 4.3% bundle size increase for significant architectural improvements
- **Chrome Extension Compatible**: Full Manifest V3 compatibility with optimized content script loading

**Module Interfaces:**
- SecurityValidator: `validateURL()`, `analyzeThreats()`, `getThreatLevel()`, `getSecurityAnalysis()`
- ModalManager: `showConfirmationModal()`, `createSafeElement()`, callback system for statistics and URL validation
- Integration: NavigationGuardian coordinates both modules through dependency injection and clean callback interfaces

**Performance Impact:**
- Bundle size: +3.9KB (+4.3% - acceptable for modularity benefits)
- Runtime overhead: <1ms module instantiation, minimal memory increase
- Build compatibility: Vite tree-shaking and optimization maintained

**Threat Pattern Architecture:**

The extension uses a centralized threat pattern system to ensure consistency and reduce code duplication:

**Core Module:**
- **threat-patterns.js** (`src/scripts/utils/threat-patterns.js`): Shared threat pattern definitions and helpers

**Exports:**
- `AD_NETWORK_DOMAINS[]`: Known malicious ad networks (pubfuture-ad.com, clickadu.com, propellerads.com, popcash.com/net, adexchangeclear.com)
- `TRACKING_PARAMETERS[]`: Suspicious tracking params (param_4, param_5, clickid, adclick, redirect)
- `URL_THREAT_PATTERNS{}`: Pre-compiled regex patterns (phpTracking, adNetworks, popUnderKeyword)
- `THREAT_SCORES{}`: Consistent risk scoring (adexchangeclear: 8, genericAdNetwork: 5, phpTracking: 6, etc.)
- `getAdNetworkScore(domain)`: Helper function for domain risk scoring
- `findTrackingParams(urlObj)`: Helper function for URL parameter analysis

**Consumers:**
- **MaliciousPatternDetector** (`src/scripts/utils/malicious-pattern-detector.js`):
  - JavaScript code analysis + URL validation for pop-under detection
  - Uses shared patterns for ad networks and tracking params
  - Module-specific patterns for pop-under signatures, click hijacking, localStorage abuse
  - Methods: `analyze(code, threshold)`, `isUrlMalicious(url)`

- **SecurityValidator** (`src/scripts/modules/navigation-guardian/security-validator.js`):
  - URL security validation + threat analysis for navigation blocking
  - Uses shared patterns for ad networks and tracking params
  - Module-specific patterns for unicode attacks, suspicious TLDs, protocol validation
  - Methods: `validateURL(url)`, `analyzeThreats(url)`, `getThreatLevel(riskScore)`, `getSecurityAnalysis(url)`

**Benefits:**
- **Single Source of Truth**: Update ad networks/tracking params once, affects both modules
- **Consistent Risk Scoring**: Same threat = same score across all detection systems
- **Reduced Duplication**: -800 bytes of duplicated pattern definitions eliminated
- **Easy Maintenance**: Add new threats to threat-patterns.js, automatically used by both modules
- **Minimal Bundle Impact**: +0.82KB total (+0.25%) for significant architectural improvement

**Performance Optimization:**

- **Time-Slicing**: Non-blocking execution that respects frame budgets
- **Chrome API Safety**: Robust Chrome storage operations with retry mechanisms and context validation
- **Debounced Operations**: Reduced API call frequency through intelligent debouncing

**Testing Extension:**
1. Run `npm run build` to build to `dist/`
2. Open Chrome → Extensions → Developer mode → Load unpacked → Select `dist/` folder
3. Test popup, settings page, and modular content script functionality
4. Use Chrome DevTools → Console to debug individual protection modules
5. Use Extension DevTools to debug popup and background script
6. Verify each protection module operates independently
