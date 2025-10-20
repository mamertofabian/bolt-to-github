import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * Extension fixture type
 */
type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

/**
 * Path to the built extension
 */
const extensionPath = path.join(process.cwd(), 'dist');

/**
 * Playwright fixture for Chrome extension testing
 *
 * This fixture:
 * - Launches Chrome with the extension loaded from the dist folder
 * - Extracts the extension ID for use in tests
 * - Provides a context with the extension pre-loaded
 *
 * Usage:
 * ```ts
 * test('my test', async ({ context, extensionId }) => {
 *   // Use context and extensionId in tests
 * });
 * ```
 */
export const test = base.extend<ExtensionFixtures>({
  // Override the context fixture to load the extension
  context: async ({}, use) => {
    // Create a unique temp directory for this test's user data
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-extension-'));

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    await use(context);
    await context.close();

    // Clean up temp directory
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  },

  // Extract extension ID from the chrome://extensions page
  extensionId: async ({ context }, use) => {
    // Navigate to chrome://extensions to find the extension ID
    const page = await context.newPage();

    try {
      await page.goto('chrome://extensions', { timeout: 10000 });

      // Enable developer mode by clicking the toggle
      const devModeToggle = page.locator('cr-toggle#devMode');
      await devModeToggle.waitFor({ state: 'visible', timeout: 5000 });

      // Check if developer mode is already enabled
      const isEnabled = await devModeToggle.evaluate((el: HTMLElement) => {
        return el.hasAttribute('checked');
      });

      if (!isEnabled) {
        await devModeToggle.click();
        await page.waitForTimeout(500);
      }

      // Get the extension ID from the extension card
      const extensionCard = page.locator('extensions-item').first();
      await extensionCard.waitFor({ state: 'visible', timeout: 5000 });
      const extensionId = await extensionCard.getAttribute('id');

      if (!extensionId) {
        throw new Error(
          'Could not find extension ID. Make sure the extension is built in the dist folder.'
        );
      }

      await page.close();
      await use(extensionId);
    } catch (error) {
      await page.close();
      throw error;
    }
  },
});

export { expect } from '@playwright/test';
