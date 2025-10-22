import { test, expect } from './fixtures/extension';

/**
 * Smoke test suite for Bolt to GitHub extension
 *
 * These tests verify that the extension loads and is functional
 * in a real Chrome browser environment.
 */
test.describe('Extension Smoke Tests', () => {
  test('should load the extension successfully', async ({ context, extensionId }) => {
    // Verify we have an extension ID
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/); // Chrome extension IDs are 32 lowercase letters

    // Navigate to chrome://extensions to verify the extension is loaded
    const page = await context.newPage();
    await page.goto('chrome://extensions');

    // Enable developer mode to see extension details
    const devModeToggle = page.locator('cr-toggle#devMode');
    await devModeToggle.waitFor({ state: 'visible' });

    const isEnabled = await devModeToggle.evaluate((el: HTMLElement) => {
      return el.hasAttribute('checked');
    });

    if (!isEnabled) {
      await devModeToggle.click();
      await page.waitForTimeout(500);
    }

    // Verify the extension card exists
    const extensionCard = page.locator(`extensions-item#${extensionId}`);
    await expect(extensionCard).toBeVisible();

    // Verify extension name
    const extensionName = extensionCard.locator('#name-and-version');
    await expect(extensionName).toContainText('Bolt to GitHub');

    // Verify extension is enabled by checking the cr-toggle element
    const enableToggle = extensionCard.locator('cr-toggle#enableToggle');
    const isExtensionEnabled = await enableToggle.evaluate((el: HTMLElement) => {
      return el.hasAttribute('checked');
    });
    expect(isExtensionEnabled).toBe(true);

    await page.close();
  });

  test('should be able to open the extension popup', async ({ context, extensionId }) => {
    // Open the extension popup by navigating to its URL
    const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html`;
    const page = await context.newPage();
    await page.goto(popupUrl);

    // Verify the popup loads (check for body element as a basic smoke test)
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // The popup should have loaded some content
    // We don't check for specific UI elements to avoid brittleness
    // Just verify the page loaded successfully
    const hasContent = await body.evaluate((el) => el.innerHTML.length > 0);
    expect(hasContent).toBe(true);

    await page.close();
  });

  test('should have service worker registered', async ({ context, extensionId }) => {
    // Create a new page to interact with the extension
    const page = await context.newPage();

    // Navigate to chrome://serviceworker-internals to check service worker
    await page.goto('chrome://serviceworker-internals');

    // Look for our extension's service worker
    // Service workers for extensions are listed with their extension ID
    const pageContent = await page.content();
    expect(pageContent).toContain(extensionId);

    await page.close();
  });
});
