/**
 * Integration Tests for Rule Execution Pipeline
 *
 * @fileoverview Tests the complete flow: Sources → Parsers → Executors → Blocking
 * Validates the entire ad blocking system with real DOM structures.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { DomScanner } from '@modules/rule-execution/executors/hybrid-executor/dom-scanner.js';
import { TokenIndexer } from '@modules/rule-execution/executors/hybrid-executor/token-indexer.js';
import {
  simpleRules,
  complexRules,
  falsePositiveRules,
  scriptAndLinkRules,
  filterRulesByDomain
} from '@tests/fixtures/mock-rules.js';
import { adHTMLSamples } from '@tests/fixtures/ad-html-samples.js';

describe('Rule Execution Pipeline Integration', () => {
  beforeEach(() => {
    // Clear document body before each test
    document.body.innerHTML = '';

    // Setup window.location for iframe tests
    if (!window.location.hostname) {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'example.com',
          href: 'https://example.com/page'
        },
        writable: true
      });
    }
  });

  afterEach(() => {
    // Cleanup document body after each test
    document.body.innerHTML = '';
  });

  // ========== P1: END-TO-END FLOW TESTS ==========

  test('should execute complete pipeline: parse selectors → index tokens → scan DOM → block elements', () => {
    // Setup: Add HTML with ads
    document.body.innerHTML = `
      <div class="ad-banner">Advertisement</div>
      <div class="content">Legitimate content</div>
    `;

    // 1. Extract selectors from rules
    const selectors = simpleRules.map(rule => rule.selector);

    // 2. Build token index from selectors
    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(selectors);

    // 3. Scan DOM with token index
    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    const stats = scanner.scan();

    // 4. Verify blocking occurred correctly
    const adElement = document.querySelector('.ad-banner');
    const contentElement = document.querySelector('.content');

    expect(adElement.hasAttribute('data-content-blocked')).toBe(true);
    expect(contentElement.hasAttribute('data-content-blocked')).toBe(false);
    expect(stats.hidden).toBe(1);
    expect(stats.removed).toBe(0);
  });

  test('should coordinate multiple rule sources without conflicts', () => {
    document.body.innerHTML = `
      <div class="ad-banner">Ad 1</div>
      <div class="advertisement">Ad 2</div>
      <div class="sponsored-content">Ad 3</div>
      <div class="content">Content</div>
    `;

    // Combine rules from multiple sources
    const allSelectors = [
      ...simpleRules.map(r => r.selector),
      ...complexRules.map(r => r.selector)
    ];

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(allSelectors);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    const stats = scanner.scan();

    // Verify all ads blocked, no duplicates
    const blockedElements = document.querySelectorAll('[data-content-blocked="true"]');
    expect(blockedElements.length).toBe(3);
    expect(stats.hidden).toBe(3);
  });

  // ========== P1: REAL DOM STRUCTURE TESTS ==========

  test('should block common ad banner patterns', () => {
    document.body.innerHTML = adHTMLSamples.bannerAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const adElement = document.querySelector('.ad-banner');
    expect(adElement.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should block sidebar ads', () => {
    document.body.innerHTML = adHTMLSamples.sidebarAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const sidebarAd = document.querySelector('#sidebar-ads');
    expect(sidebarAd.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should block inline ads without affecting surrounding content', () => {
    document.body.innerHTML = adHTMLSamples.inlineAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const inlineAd = document.querySelector('.ad-inline');
    const paragraphs = document.querySelectorAll('p');

    expect(inlineAd.getAttribute('data-content-blocked')).toBe('true');
    // Verify paragraphs not blocked
    paragraphs.forEach(p => {
      expect(p.hasAttribute('data-content-blocked')).toBe(false);
    });
  });

  test('should block ad iframes', () => {
    document.body.innerHTML = `
      <iframe src="https://doubleclick.net/ad" class="ad-iframe"></iframe>
    `;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['iframe[src*="doubleclick"]']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    // iframe should be removed (tiered removal strategy)
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeNull(); // Removed from DOM
  });

  // ========== P1: FALSE POSITIVE PREVENTION TESTS ==========

  test('should NOT block legitimate sections with partial token match', () => {
    document.body.innerHTML = adHTMLSamples.falsePositiveSection;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(falsePositiveRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const section = document.querySelector('.section');
    // Token "section" matches but selector ".ad-section" should fail validation
    expect(section.hasAttribute('data-content-blocked')).toBe(false);
  });

  test('should NOT block legitimate navigation headers', () => {
    document.body.innerHTML = adHTMLSamples.falsePositiveHeader;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(falsePositiveRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const header = document.querySelector('.header');
    expect(header.hasAttribute('data-content-blocked')).toBe(false);
  });

  test('should NOT block main content divs with partial token match', () => {
    document.body.innerHTML = adHTMLSamples.falsePositiveContent;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(falsePositiveRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const content = document.querySelector('.content');
    expect(content.hasAttribute('data-content-blocked')).toBe(false);
  });

  // ========== P1: FRAMEWORK SAFETY TESTS ==========

  test('should hide React-managed divs, not remove them', () => {
    document.body.innerHTML = adHTMLSamples.reactAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.ad-widget']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const reactDiv = document.querySelector('[data-reactroot]');
    // Should be hidden (data-content-blocked), NOT removed
    expect(reactDiv).not.toBeNull();
    expect(reactDiv.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should hide Vue-managed elements, not remove them', () => {
    document.body.innerHTML = adHTMLSamples.vueAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.advertisement']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const vueDiv = document.querySelector('[data-v-7f6a8b4e]');
    expect(vueDiv).not.toBeNull();
    expect(vueDiv.getAttribute('data-content-blocked')).toBe('true');
  });

  // ========== P2: DYNAMIC CONTENT TESTS ==========

  test('should detect and block dynamically injected ads', () => {
    document.body.innerHTML = '<div id="container"></div>';

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });

    // Initial scan
    scanner.scan();

    // Inject ad dynamically
    const container = document.getElementById('container');
    container.innerHTML = '<div class="ad-banner">Injected Ad</div>';

    // Scan again (simulating MutationObserver trigger)
    const newAdElement = document.querySelector('#container .ad-banner');
    scanner.processElement(newAdElement);

    expect(newAdElement.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should handle rapid DOM mutations efficiently', () => {
    document.body.innerHTML = '<div id="container"></div>';

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    const container = document.getElementById('container');

    // Inject 50 ads rapidly
    const startTime = Date.now();
    for (let i = 0; i < 50; i++) {
      const ad = document.createElement('div');
      ad.className = 'ad-banner';
      ad.textContent = `Ad ${i}`;
      container.appendChild(ad);
      scanner.processElement(ad);
    }
    const duration = Date.now() - startTime;

    // Verify all blocked and performance acceptable
    const blockedAds = container.querySelectorAll('[data-content-blocked="true"]');
    expect(blockedAds.length).toBe(50);
    expect(duration).toBeLessThan(100); // Should complete in < 100ms
  });

  // ========== P2: PERFORMANCE TESTS ==========

  test('should process 1000 elements within reasonable time', () => {
    // Generate large DOM
    const elements = [];
    for (let i = 0; i < 1000; i++) {
      elements.push(`<div class="${i % 10 === 0 ? 'ad-banner' : 'content'}" id="el-${i}">Element ${i}</div>`);
    }
    document.body.innerHTML = elements.join('');

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });

    const startTime = Date.now();
    const stats = scanner.scan();
    const duration = Date.now() - startTime;

    // Should block ~100 ads (every 10th element)
    expect(stats.hidden).toBe(100);
    // Should complete in reasonable time
    expect(duration).toBeLessThan(200);
  });

  test('should handle 100+ selectors efficiently with token indexing', () => {
    document.body.innerHTML = `
      <div class="ad-banner">Ad 1</div>
      <div class="content">Content</div>
    `;

    // Create 100 selectors
    const selectors = Array.from({ length: 100 }, (_, i) => `.ad-variant-${i}`);
    selectors.push('.ad-banner'); // Add actual matching selector

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(selectors);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });

    const startTime = Date.now();
    scanner.scan();
    const duration = Date.now() - startTime;

    const adElement = document.querySelector('.ad-banner');
    expect(adElement.getAttribute('data-content-blocked')).toBe('true');
    expect(duration).toBeLessThan(50); // Token indexing makes this fast
  });

  // ========== P2: DOMAIN FILTERING TESTS ==========

  test('should apply domain-specific rules correctly', () => {
    document.body.innerHTML = `
      <div class="site-specific-ad">Domain-specific ad</div>
      <div class="ad-banner">Generic ad</div>
    `;

    // Filter rules for specific domain
    const domainSpecificRules = filterRulesByDomain(simpleRules, 'example.com');
    const selectors = domainSpecificRules.map(r => r.selector);

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(selectors);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    // Generic ad should be blocked (universal rule)
    const genericAd = document.querySelector('.ad-banner');
    expect(genericAd.getAttribute('data-content-blocked')).toBe('true');
  });

  // ========== P2: STATISTICS ACCURACY TESTS ==========

  test('should accurately report removed vs hidden counts', () => {
    document.body.innerHTML = `
      <script class="ad-script" src="ad.js"></script>
      <div class="ad-banner">Banner</div>
      <iframe src="https://ads.example.com/ad"></iframe>
      <span class="advertisement">Span ad</span>
    `;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build([...simpleRules, ...scriptAndLinkRules].map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    const stats = scanner.scan();

    // Scripts and iframes should be removed
    expect(stats.removed).toBeGreaterThan(0);
    // Divs and spans should be hidden
    expect(stats.hidden).toBeGreaterThan(0);
    // Total should match number of ads
    expect(stats.removed + stats.hidden).toBeGreaterThanOrEqual(2);
  });

  test('should reset stats correctly between scans', () => {
    document.body.innerHTML = `
      <div class="ad-banner">Ad 1</div>
      <div class="advertisement">Ad 2</div>
    `;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(simpleRules.map(r => r.selector));

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });

    // First scan
    const stats1 = scanner.scan();
    expect(stats1.hidden).toBe(2);

    // Reset stats
    scanner.resetStats();
    expect(scanner.getStats().hidden).toBe(0);
    expect(scanner.getStats().removed).toBe(0);

    // Add new ads to scan
    document.body.innerHTML += `
      <div class="ad-banner">Ad 3</div>
    `;

    // Scan again - should find the new ad
    const newAd = document.querySelector('.ad-banner:not([data-content-blocked])');
    const result = scanner.processElement(newAd);

    expect(result.hidden).toBe(1);
    expect(scanner.getStats().hidden).toBe(1);
  });

  // ========== P2: COMPLEX SELECTOR TESTS ==========

  test('should handle attribute selectors with class tokens', () => {
    document.body.innerHTML = `
      <div class="ad-banner ad-widget">Has ad- prefix</div>
      <div class="widget">No ad- prefix</div>
    `;

    // Use class-based selectors that will match via tokens
    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.ad-banner', '.ad-widget']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const adDiv = document.querySelector('.ad-banner');
    const normalDiv = document.querySelector('.widget:not([class*="ad"])');

    expect(adDiv.getAttribute('data-content-blocked')).toBe('true');
    expect(normalDiv.hasAttribute('data-content-blocked')).toBe(false);
  });

  test('should handle descendant combinators correctly', () => {
    document.body.innerHTML = `
      <div class="container">
        <div class="ad">Direct child ad</div>
      </div>
      <div class="ad">Top-level ad</div>
    `;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['div.container > .ad']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const directChildAd = document.querySelector('.container > .ad');
    expect(directChildAd.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should handle pseudo-classes correctly', () => {
    document.body.innerHTML = `
      <div class="widget">Non-featured widget</div>
      <div class="widget featured">Featured widget</div>
    `;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.widget:not(.featured)']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const normalWidget = document.querySelector('.widget:not(.featured)');
    const featuredWidget = document.querySelector('.widget.featured');

    expect(normalWidget.getAttribute('data-content-blocked')).toBe('true');
    expect(featuredWidget.hasAttribute('data-content-blocked')).toBe(false);
  });

  // ========== P2: EDGE CASE TESTS ==========

  test('should handle nested ads correctly', () => {
    document.body.innerHTML = adHTMLSamples.nestedAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.ad-placement']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const adPlacement = document.querySelector('.ad-placement');
    expect(adPlacement.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should handle obfuscated ad classes (case variations)', () => {
    document.body.innerHTML = adHTMLSamples.obfuscatedAd;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.AdBanner', '.ADVERTISEMENT', '.ad_container']);

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const obfuscatedAd = document.querySelector('.AdBanner');
    expect(obfuscatedAd.getAttribute('data-content-blocked')).toBe('true');
  });

  test('should not block when token matches but selector validation fails', () => {
    document.body.innerHTML = `
      <section class="section">Legitimate section</section>
    `;

    const tokenIndexer = new TokenIndexer();
    tokenIndexer.build(['.ad-section']); // Token "section" matches but selector won't

    const scanner = new DomScanner(tokenIndexer, { enableRemoval: true });
    scanner.scan();

    const section = document.querySelector('.section');
    // Critical: Selector validation should prevent false positive
    expect(section.hasAttribute('data-content-blocked')).toBe(false);
  });
});
