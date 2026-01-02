/**
 * Playwright Visual Test for Toast Notification
 *
 * Tests the showBlockedToast function visually and verifies:
 * 1. Toast appears correctly
 * 2. XSS protection works (malicious code displayed as text, not executed)
 * 3. URL truncation works
 * 4. Multiple toasts stack properly
 * 5. Auto-dismiss after 3 seconds
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Toast Notification Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Load the test HTML file
    const testFile = path.join(__dirname, 'toast-notification.test.html');
    await page.goto(`file://${testFile}`);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display normal toast notification', async ({ page }) => {
    // Click button to show toast
    await page.click('#test-normal');

    // Wait for toast animation
    await page.waitForTimeout(500);

    // Verify toast is visible
    const toast = page.locator('.originalui-blocked-toast');
    await expect(toast).toBeVisible();

    // Verify content with new purple toast design
    await expect(toast).toContainText('Navigation Block');
    await expect(toast).toContainText('malicious-pattern');
    await expect(toast).toContainText('https://malicious-ad-network.com/popup');

    // Take screenshot
    await page.screenshot({
      path: 'tests/visual/screenshots/toast-normal.png',
      fullPage: true
    });

    // Verify auto-dismiss (wait 3.5s total)
    await page.waitForTimeout(3000);
    await expect(toast).not.toBeVisible();
  });

  test('should truncate long URLs', async ({ page }) => {
    await page.click('#test-long');
    await page.waitForTimeout(500);

    const toast = page.locator('.originalui-blocked-toast');
    await expect(toast).toBeVisible();

    // Should contain truncation indicator
    const text = await toast.textContent();
    expect(text).toContain('...');
    expect(text.length).toBeLessThan(200); // Truncated

    await page.screenshot({
      path: 'tests/visual/screenshots/toast-long-url.png',
      fullPage: true
    });
  });

  test('should prevent XSS - script tags displayed as text', async ({ page }) => {
    // Set up dialog listener to catch any alert() calls (should NOT happen)
    let dialogAppeared = false;
    page.on('dialog', async dialog => {
      dialogAppeared = true;
      await dialog.dismiss();
    });

    // Click XSS test button
    await page.click('#test-xss');
    await page.waitForTimeout(500);

    // Verify no alert appeared
    expect(dialogAppeared).toBe(false);

    // Verify toast shows escaped text
    const toast = page.locator('.originalui-blocked-toast');
    await expect(toast).toBeVisible();

    const text = await toast.textContent();
    // Should contain literal script tags as text, not execute them
    expect(text).toContain('<script>');
    expect(text).toContain('</script>');

    await page.screenshot({
      path: 'tests/visual/screenshots/toast-xss-prevented.png',
      fullPage: true
    });

    console.log('✅ XSS Prevention Test Passed - Script tags displayed as text, not executed');
  });

  test('should prevent XSS - javascript protocol displayed as text', async ({ page }) => {
    let dialogAppeared = false;
    page.on('dialog', async dialog => {
      dialogAppeared = true;
      await dialog.dismiss();
    });

    await page.click('#test-js-protocol');
    await page.waitForTimeout(500);

    expect(dialogAppeared).toBe(false);

    const toast = page.locator('.originalui-blocked-toast');
    const text = await toast.textContent();
    expect(text).toContain('javascript:alert');

    await page.screenshot({
      path: 'tests/visual/screenshots/toast-js-protocol-prevented.png',
      fullPage: true
    });

    console.log('✅ XSS Prevention Test Passed - JavaScript protocol displayed as text');
  });

  test('should stack multiple toasts', async ({ page }) => {
    await page.click('#test-multiple');

    // Wait for all toasts to appear
    await page.waitForTimeout(800);

    // Count visible toasts
    const toasts = page.locator('.originalui-blocked-toast');
    const count = await toasts.count();
    expect(count).toBe(3);

    await page.screenshot({
      path: 'tests/visual/screenshots/toast-multiple-stacked.png',
      fullPage: true
    });

    console.log(`✅ Multiple Toasts Test Passed - ${count} toasts displayed`);
  });

  test('should dismiss toast on click', async ({ page }) => {
    await page.click('#test-normal');
    await page.waitForTimeout(500);

    const toast = page.locator('.originalui-blocked-toast');
    await expect(toast).toBeVisible();

    // Click toast to dismiss
    await toast.click();
    await page.waitForTimeout(500);

    // Should be dismissed
    await expect(toast).not.toBeVisible();

    console.log('✅ Click-to-Dismiss Test Passed');
  });

  test('should show different reasons with proper styling', async ({ page }) => {
    // Test different reason types
    const tests = [
      { button: '#test-pop-under', reason: 'pop-under', screenshot: 'toast-reason-popunder.png' },
      { button: '#test-malicious', reason: 'malicious-pattern', screenshot: 'toast-reason-malicious.png' },
      { button: '#test-high-risk', reason: 'high-risk-navigation', screenshot: 'toast-reason-highrisk.png' }
    ];

    for (const { button, reason, screenshot } of tests) {
      await page.click(button);
      await page.waitForTimeout(500);

      const toast = page.locator('.originalui-blocked-toast').last();
      await expect(toast).toBeVisible();
      await expect(toast).toContainText(`Reason: ${reason}`);

      await page.screenshot({
        path: `tests/visual/screenshots/${screenshot}`,
        fullPage: true
      });

      // Wait for auto-dismiss
      await page.waitForTimeout(3500);
    }

    console.log('✅ Different Reasons Test Passed');
  });

  test('should have correct visual styling', async ({ page }) => {
    await page.click('#test-normal');
    await page.waitForTimeout(500);

    const toast = page.locator('.originalui-blocked-toast');

    // Verify CSS properties
    const styles = await toast.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        position: computed.position,
        bottom: computed.bottom,
        right: computed.right,
        borderRadius: computed.borderRadius,
        zIndex: computed.zIndex,
        maxWidth: computed.maxWidth,
        cursor: computed.cursor,
        background: computed.background
      };
    });

    expect(styles.position).toBe('fixed');
    expect(styles.bottom).toBe('24px'); // Updated to 24px in new design
    expect(styles.right).toBe('24px'); // Updated to 24px in new design
    expect(styles.borderRadius).toBe('16px'); // Updated to 16px in new design
    expect(styles.zIndex).toBe('2147483647'); // Max z-index
    expect(styles.maxWidth).toBe('380px'); // Updated to 380px in new design
    expect(styles.cursor).toBe('pointer');
    expect(styles.background).toContain('linear-gradient'); // Purple gradient now

    console.log('✅ Visual Styling Test Passed');
    console.log('Toast Styles:', JSON.stringify(styles, null, 2));
  });

  test('should animate in and out smoothly', async ({ page }) => {
    await page.click('#test-normal');

    // Check initial animation (fade in + slide up)
    await page.waitForTimeout(100);
    const toast = page.locator('.originalui-blocked-toast');

    const initialOpacity = await toast.evaluate(el =>
      window.getComputedStyle(el).opacity
    );

    // Should be fading in (opacity increasing)
    expect(parseFloat(initialOpacity)).toBeGreaterThan(0);

    // Wait for full fade in
    await page.waitForTimeout(400);
    const fullOpacity = await toast.evaluate(el =>
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(fullOpacity)).toBe(1);

    // Wait for auto-dismiss animation
    await page.waitForTimeout(3000);
    const dismissingOpacity = await toast.evaluate(el =>
      window.getComputedStyle(el).opacity
    );

    // Should be fading out
    expect(parseFloat(dismissingOpacity)).toBeLessThan(1);

    console.log('✅ Animation Test Passed');
  });

  test('visual regression - comprehensive screenshot', async ({ page }) => {
    // Show all toast variations for visual comparison
    await page.click('#test-normal');
    await page.waitForTimeout(600);

    await page.screenshot({
      path: 'tests/visual/screenshots/toast-comprehensive.png',
      fullPage: true
    });

    console.log('✅ Visual regression screenshot captured');
  });
});

test.describe('XSS Security Tests', () => {
  test('XSS vector 1: HTML injection via URL', async ({ page }) => {
    const testFile = path.join(__dirname, 'toast-notification.test.html');
    await page.goto(`file://${testFile}`);

    let alertTriggered = false;
    page.on('dialog', async dialog => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    // Programmatically trigger toast with malicious content
    await page.evaluate(() => {
      window.showBlockedToast(
        '<img src=x onerror=alert("XSS1")>',
        'test'
      );
    });

    await page.waitForTimeout(500);
    expect(alertTriggered).toBe(false);

    const toast = page.locator('.originalui-blocked-toast');
    const text = await toast.textContent();
    expect(text).toContain('<img src=x');

    console.log('✅ XSS Vector 1 Blocked - HTML injection escaped');
  });

  test('XSS vector 2: Event handler injection', async ({ page }) => {
    const testFile = path.join(__dirname, 'toast-notification.test.html');
    await page.goto(`file://${testFile}`);

    let alertTriggered = false;
    page.on('dialog', async dialog => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    await page.evaluate(() => {
      window.showBlockedToast(
        'https://evil.com" onclick="alert(1)"',
        'test'
      );
    });

    await page.waitForTimeout(500);

    const toast = page.locator('.originalui-blocked-toast');
    await toast.click();

    expect(alertTriggered).toBe(false);

    console.log('✅ XSS Vector 2 Blocked - Event handler escaped');
  });

  test('XSS vector 3: Reason parameter injection', async ({ page }) => {
    const testFile = path.join(__dirname, 'toast-notification.test.html');
    await page.goto(`file://${testFile}`);

    let alertTriggered = false;
    page.on('dialog', async dialog => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    await page.evaluate(() => {
      window.showBlockedToast(
        'https://test.com',
        '<script>alert("XSS3")</script>'
      );
    });

    await page.waitForTimeout(500);
    expect(alertTriggered).toBe(false);

    const toast = page.locator('.originalui-blocked-toast');
    const text = await toast.textContent();
    expect(text).toContain('<script>');

    console.log('✅ XSS Vector 3 Blocked - Reason parameter escaped');
  });
});
