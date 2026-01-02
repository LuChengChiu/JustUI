# OriginalUI

![GitHub Created At](https://img.shields.io/github/created-at/LuChengChiu/OriginalUI?color=bright-green&style=flat-square)
![GitHub contributors](https://img.shields.io/github/contributors/LuChengChiu/OriginalUI?color=bright-green&style=flat-square)
[![license](https://img.shields.io/github/license/LuChengChiu/OriginalUI.svg?color=bright-green&style=flat-square)](LICENSE)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> A comprehensive Chrome Extension providing advanced web protection through intelligent content filtering and navigation security.

OriginalUI is a powerful Chrome extension built with modern web technologies (React 19, Vite 7, Tailwind CSS 4) that delivers multi-layered protection against unwanted web content. It combines element removal, navigation interception, and network request blocking to create a safer, cleaner browsing experience.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Install](#install)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Managing Whitelist](#managing-whitelist)
  - [Custom Rules](#custom-rules)
  - [Settings Configuration](#settings-configuration)
- [Architecture](#architecture)
  - [Core Components](#core-components)
  - [Protection Modules](#protection-modules)
  - [Data Flow](#data-flow)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Build](#build)
  - [Testing](#testing)
- [API](#api)
  - [Storage Schema](#storage-schema)
  - [Migration Guide](#migration-guide)
  - [Rule Schema](#rule-schema)
- [Contributing](#contributing)
- [License](#license)

## Background

Modern web browsing is increasingly plagued by intrusive advertisements, tracking scripts, malicious redirects, and unwanted pop-ups. While traditional ad blockers focus primarily on network-level blocking, they often miss sophisticated threats that operate through JavaScript injection, DOM manipulation, and behavioral tracking.

OriginalUI takes a comprehensive, defense-in-depth approach by combining multiple protection strategies:

1. **CSS Selector-based Element Removal** - Removes known unwanted elements from the DOM
2. **Navigation Guardian** - Intercepts malicious cross-origin navigation attempts with user confirmation
3. **Network Request Blocking** - Blocks tracking and malicious domains at the network level
4. **Event Protection** - Prevents click hijacking and pop-under attacks
5. **Script Analysis** - Real-time threat detection in JavaScript execution

The extension is designed for users who want granular control over their browsing experience, with the flexibility to whitelist trusted sites while maintaining strong protection everywhere else.

## Features

### Core Protection Systems

- **Element Removal System** - Remove unwanted DOM elements using CSS selectors with built-in and custom rules
- **Navigation Guardian** - Intercept and block malicious cross-origin navigation attempts with user confirmation modals
- **Network Request Blocking** - Block malicious domains and tracking requests at the network level with regex pattern support
- **Click Hijacking Protection** - Advanced click analysis and suspicious overlay detection
- **Script Analysis** - Real-time script threat detection and monitoring
- **Whitelist Management** - Manage clean/trusted domains exempt from all protection systems

### User Experience

- **One-Click Toggle** - Enable/disable entire extension functionality
- **Domain-specific Controls** - Quick add/remove domains from whitelist
- **Real-time Statistics** - Track blocked elements, navigation attempts, and protection events
- **Modular Settings** - Comprehensive configuration interface with beta UI
- **Import/Export** - Backup and restore rules and settings
- **Performance Optimized** - Adaptive batch sizing and time-slicing for minimal impact

### Technical Highlights

- **React 19** with modern hooks and concurrent features
- **Vite 7** for lightning-fast builds and development
- **Tailwind CSS 4** for utility-first styling
- **Manifest V3** compliance for Chrome Extension best practices
- **Modular Architecture** with clean separation of concerns
- **Memory Leak Prevention** through comprehensive cleanup systems
- **Chrome Storage API** with context validation and retry mechanisms

## Install

### From Chrome Web Store

Coming soon.

### Manual Installation (Development)

> **⚠️ IMPORTANT: This is a build-based extension**
>
> - **DO NOT** load the root project folder as an extension
> - **ALWAYS** build first with `npm run build`
> - **ONLY** load the `dist/` folder in Chrome Extensions
> - Source files are in `src/`, built output in `dist/`

This extension requires Node.js and npm. Ensure you have them installed:

```bash
node --version  # v18.0.0 or higher recommended
npm --version   # v9.0.0 or higher recommended
```

Clone the repository and install dependencies:

```bash
git clone https://github.com/LuChengChiu/OriginalUI.git
cd OriginalUI
npm install
```

Build the extension:

```bash
npm run build
```

> ✅ After building, the complete extension will be in the `dist/` directory with all dependencies bundled.

Load the extension in Chrome:

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. **Select the `dist/` directory** (NOT the root folder)

The OriginalUI icon should now appear in your Chrome toolbar.

## Usage

### Quick Start

1. **Activate Protection** - Click the OriginalUI icon and toggle the extension ON
2. **Browse Normally** - The extension will automatically protect you across all websites
3. **Trust Clean Sites** - Click "Add to whitelist" for sites you trust to exempt them from all protection
4. **View Statistics** - See real-time blocked element counts and navigation attempt statistics in the popup

### Managing Whitelist

The whitelist contains domains that are **clean/trusted** and **exempt from all protection systems**. Use this for sites you completely trust.

**Add a domain to whitelist:**

1. Navigate to the trusted site
2. Click the OriginalUI icon
3. Click "Add to whitelist"

**Remove from whitelist:**

1. Navigate to the whitelisted site
2. Click the OriginalUI icon
3. Click "Remove from whitelist"

**Bulk management:**

1. Right-click OriginalUI icon → Options
2. Navigate to "Whitelist" section
3. Add, edit, or remove domains

### Custom Rules

Create custom CSS selector rules to remove specific elements:

1. Right-click OriginalUI icon → Options
2. Navigate to "Custom Rules" section
3. Click "Add New Rule"
4. Fill in the form:
   - **Selector**: CSS selector (e.g., `.advertisement`, `#popup-modal`)
   - **Description**: Human-readable description
   - **Domains**: `*` for all domains or specific domains (e.g., `example.com`)
   - **Category**: Type of content (advertising, tracking, social, popup)
   - **Confidence**: High, Medium, or Low

Example custom rule:

```json
{
  "selector": ".sponsored-content",
  "description": "Remove sponsored posts",
  "domains": ["*"],
  "category": "advertising",
  "confidence": "high",
  "enabled": true
}
```

### Settings Configuration

Access comprehensive settings by right-clicking the OriginalUI icon and selecting "Options":

- **Whitelist Management** - Add/remove trusted domains
- **Default Rules** - Toggle built-in protection rules
- **Custom Rules** - Create and manage custom CSS selector rules
- **Navigation Guardian** - Configure cross-origin navigation protection
- **Network Blocking** - Manage network request blocking patterns
- **Import/Export** - Backup and restore your configuration

## Architecture

### Core Components

OriginalUI uses a modular architecture with clear separation of concerns:

```
src/
├── popup.jsx                          # Extension popup interface
├── App.jsx                            # Main popup component
├── settings.jsx                       # Settings page (classic)
├── settings-beta.jsx                  # Modern beta settings UI
├── components/
│   ├── ui/                            # Reusable UI components
│   └── settings/                      # Modular settings components
├── scripts/
│   ├── content.js                     # OriginalUIController orchestrator
│   ├── background.js                  # Service worker
│   ├── injected-script.js             # Page-world JavaScript interception
│   ├── constants.js                   # Shared configuration
│   ├── modules/                       # Protection modules
│   └── utils/                         # Utility functions
└── data/
    ├── defaultRules.json              # Built-in element removal rules
    ├── defaultWhitelist.json          # Pre-configured trusted domains
    └── defaultBlockRequests.json      # Network blocking patterns
```

### Protection Modules

Each protection module operates independently with well-defined interfaces:

- **ScriptAnalyzer** - Real-time script threat analysis
- **NavigationGuardian** - Cross-origin navigation interception with user confirmation
- **ClickHijackingProtector** - Click analysis and overlay detection
- **ElementRemover** - DOM manipulation with multiple strategies
- **RequestBlockingProtector** - Request interception and blocking

### Data Flow

1. User loads page → OriginalUIController loads settings first
2. If domain is whitelisted OR extension inactive → Skip all protections
3. If active and not whitelisted → Activate all enabled protection modules
4. NavigationGuardian monitors cross-origin navigation attempts
5. Element removal executes based on CSS selector rules
6. Statistics sync to Chrome storage and display in popup

## Development

### Prerequisites

- Node.js v18.0.0 or higher
- npm v9.0.0 or higher
- Chrome browser (latest version recommended)

### Build

Development mode with hot reload:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Development build (unminified for debugging):

```bash
npm run build:dev
```

Preview production build:

```bash
npm run preview
```

### Testing

Load the extension in Chrome for testing:

1. Build the extension: `npm run build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → Select `dist/` folder
5. Navigate to test websites
6. Open Chrome DevTools → Console to view debug output
7. Test each protection module independently

### Project Structure

```
project/
├── src/                           # Source files (edit these)
│   ├── manifest.json             # Extension manifest (source of truth)
│   ├── scripts/                  # Extension scripts (pre-build)
│   │   ├── background.js
│   │   ├── content.js
│   │   └── modules/              # Protection modules
│   ├── components/               # React components
│   ├── data/                     # Default configurations
│   └── ...
├── dist/                          # Built extension (load this in Chrome)
│   ├── manifest.json             # Copied from src/
│   ├── scripts/                  # Bundled scripts
│   │   ├── background.js         # Compiled service worker
│   │   ├── content.js            # Compiled content script
│   │   └── injected-script.js    # Compiled injected script
│   └── ...
├── popup.html                     # Extension popup entry point
├── settings.html                  # Classic settings page
├── settings-beta.html             # Modern beta settings UI
├── vite.config.js                 # Vite build configuration with validation
├── tailwind.config.js             # Tailwind CSS configuration
└── postcss.config.js              # PostCSS configuration
```

**Important:**
- Edit source files in `src/`
- Build process copies `src/manifest.json` to `dist/manifest.json`
- Build validation ensures all manifest references exist in `dist/`

## API

### Storage Schema

OriginalUI uses Chrome's Storage API with the following schema:

```javascript
{
  isActive: boolean,                    // Main extension toggle
  whitelist: string[],                  // Clean domains exempt from protection
  defaultRules: Rule[],                 // Built-in element removal rules
  customRules: Rule[],                  // User-defined rules
  defaultRulesEnabled: boolean,         // Toggle for default rules
  customRulesEnabled: boolean,          // Toggle for custom rules
  navigationGuardEnabled: boolean,      // Toggle for navigation guardian
  defaultBlockRequestEnabled: boolean,  // Toggle for network blocking
  networkBlockPatterns: string[],       // Custom network blocking patterns
  navigationStats: {                    // Navigation statistics
    blockedCount: number,
    allowedCount: number
  },
  domainStats: {                        // Per-domain statistics (session)
    [domain]: {
      defaultRulesRemoved: number,
      customRulesRemoved: number
    }
  }
}
```

Additional internal storage (managed by modules, not user-facing):

- `permissionCacheV1` - Navigation permission cache. See `MIGRATIONS.md` for schema details and versioning policy.

### Migration Guide

See `MIGRATIONS.md` for storage schema versioning, migration steps, and the permission cache upgrade path.

### Rule Schema

Element removal rules follow this structure:

```javascript
{
  id: string,                          // Unique identifier
  selector: string,                    // CSS selector
  description: string,                 // Human-readable description
  confidence: 'high' | 'medium' | 'low', // Rule confidence level
  domains: string[],                   // ['*'] for all or specific domains
  category: string,                    // 'advertising', 'tracking', etc.
  enabled: boolean                     // Individual rule toggle
}
```

### Chrome Extension Permissions

- `activeTab` - Access to current tab for domain detection
- `storage` - Chrome storage API for persisting state
- `scripting` - Execute content scripts for DOM manipulation
- `alarms` - Schedule periodic tasks
- `webNavigation` - Monitor navigation events
- `declarativeNetRequest` - Network request blocking
- `declarativeNetRequestFeedback` - Network blocking feedback

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow the modular architecture patterns
- Maintain comprehensive cleanup systems to prevent memory leaks
- Write clear, descriptive commit messages
- Test thoroughly across different websites
- Document new features and API changes
- Follow the existing code style (React hooks, modern JavaScript)

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a welcoming environment

## License

GNU General Public License v3.0 © LuChengChiu

See [LICENSE](LICENSE) for details.

---

**Note**: This extension is in active development. Features and APIs may change. Please report issues at [github.com/LuChengChiu/OriginalUI/issues](https://github.com/LuChengChiu/OriginalUI/issues).
