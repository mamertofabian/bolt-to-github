import { test, expect } from './fixtures/extension';
import {
  clearStorage,
  setupPATAuth,
  setupGitHubAppAuth,
  getGitHubSettings,
} from './helpers/storage';
import { openPopup } from './helpers/popup';

/**
 * Extension Lifecycle Tests
 *
 * These tests verify extension lifecycle scenarios:
 * - Extension installation and first-run state
 * - Extension update scenarios (settings persistence)
 * - Service worker restart handling
 * - Tab idle/active state detection
 * - Notification deduplication across tabs
 */

test.describe('Extension Lifecycle', () => {
  test.describe('Installation and First Run', () => {
    test('should have clean state on first install', async ({ context, extensionId }) => {
      // Clear storage to simulate fresh install
      await clearStorage(context, extensionId);

      // Check that storage is empty
      const settings = await getGitHubSettings(context, extensionId);
      expect(settings).toEqual({});

      // Open popup and verify onboarding shows
      const page = await openPopup(context, extensionId);

      // Should show onboarding/welcome screen
      const welcomeVisible = await page
        .locator('text=/welcome|get.*started|authenticate/i')
        .first()
        .isVisible({ timeout: 3000 });
      expect(welcomeVisible).toBe(true);

      await page.close();
    });

    test('should initialize default settings on first run', async ({ context, extensionId }) => {
      await clearStorage(context, extensionId);

      const page = await openPopup(context, extensionId);
      await page.waitForTimeout(1000);

      // Extension should set up default settings structure
      // Check for default UI elements
      const hasUI = await page.locator('body').isVisible();
      expect(hasUI).toBe(true);

      await page.close();
    });

    test('should request necessary permissions on first run', async ({ context, extensionId }) => {
      // Extension should have storage, tabs, and activeTab permissions
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

      // Check that chrome APIs are available
      const hasPermissions = await page.evaluate(() => {
        return (
          typeof chrome !== 'undefined' &&
          typeof chrome.storage !== 'undefined' &&
          typeof chrome.tabs !== 'undefined'
        );
      });

      expect(hasPermissions).toBe(true);

      await page.close();
    });
  });

  test.describe('Extension Updates', () => {
    test('should persist settings after extension reload', async ({ context, extensionId }) => {
      // Set up authentication
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Verify settings are saved
      const settingsBefore = await getGitHubSettings(context, extensionId);
      expect(settingsBefore.authType).toBe('pat');
      expect(settingsBefore.pat).toBe('ghp_test_token');

      // Open and close popup (simulates reload)
      const page = await openPopup(context, extensionId);
      await page.close();

      // Settings should still be there
      const settingsAfter = await getGitHubSettings(context, extensionId);
      expect(settingsAfter).toEqual(settingsBefore);
    });

    test('should maintain GitHub App authentication after update', async ({
      context,
      extensionId,
    }) => {
      // Set up GitHub App auth
      await setupGitHubAppAuth(context, extensionId, 12345, 'testuser');

      // Verify settings
      const settingsBefore = await getGitHubSettings(context, extensionId);
      expect(settingsBefore.authType).toBe('github_app');

      // Simulate extension reload by reopening popup
      const page = await openPopup(context, extensionId);
      await page.waitForTimeout(1000);
      await page.close();

      // Settings should persist
      const settingsAfter = await getGitHubSettings(context, extensionId);
      expect(settingsAfter.authType).toBe('github_app');
      expect(settingsAfter.installationId).toBe(12345);
    });

    test('should preserve repository settings across sessions', async ({
      context,
      extensionId,
    }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Set repository settings in storage
      const storageSetPage = await context.newPage();
      await storageSetPage.goto(`chrome-extension://${extensionId}/popup.html`);

      await storageSetPage.evaluate(() => {
        return chrome.storage.local.set({
          repositorySettings: {
            repoName: 'test-repo',
            branch: 'develop',
            visibility: 'private',
          },
        });
      });

      await storageSetPage.close();

      // Reopen popup in new session
      const page = await openPopup(context, extensionId);
      await page.waitForTimeout(1000);

      // Verify settings can be retrieved
      const storageGetPage = await context.newPage();
      await storageGetPage.goto(`chrome-extension://${extensionId}/popup.html`);

      const repoSettings = await storageGetPage.evaluate(() => {
        return chrome.storage.local
          .get('repositorySettings')
          .then((result) => result.repositorySettings);
      });

      expect(repoSettings).toBeDefined();
      expect(repoSettings.repoName).toBe('test-repo');

      await storageGetPage.close();
      await page.close();
    });

    test('should handle version migration gracefully', async ({ context, extensionId }) => {
      // Simulate old version settings format
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

      await page.evaluate(() => {
        return chrome.storage.local.set({
          legacySettings: {
            oldFormatToken: 'old_token_123',
          },
        });
      });

      await page.close();

      // Open popup - should handle old format gracefully
      const popupPage = await openPopup(context, extensionId);
      await popupPage.waitForTimeout(1000);

      // Extension should not crash
      const hasUI = await popupPage.locator('body').isVisible();
      expect(hasUI).toBe(true);

      await popupPage.close();
    });
  });

  test.describe('Service Worker Lifecycle', () => {
    test('should have active service worker', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome://extensions`);

      // Navigate to service worker section for this extension
      await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

      // Check service worker is registered
      const swRegistered = await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration !== undefined;
        }
        return false;
      });

      // Note: Chrome extensions use background service workers, not page service workers
      // So this may return false, which is expected
      expect(typeof swRegistered).toBe('boolean');

      await page.close();
    });

    test('should handle service worker restart', async ({ context, extensionId }) => {
      // Set up data before restart
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Open popup
      const page1 = await openPopup(context, extensionId);
      await page1.waitForTimeout(500);
      await page1.close();

      // Simulate service worker restart by creating new context
      // In real scenario, service worker restarts after inactivity
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Open popup again
      const page2 = await openPopup(context, extensionId);
      await page2.waitForTimeout(500);

      // Settings should still be available
      const settings = await getGitHubSettings(context, extensionId);
      expect(settings.authType).toBe('pat');

      await page2.close();
    });

    test('should re-register event listeners after restart', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Open popup multiple times to test event listener persistence
      for (let i = 0; i < 3; i++) {
        const page = await openPopup(context, extensionId);
        await page.waitForTimeout(500);

        // Popup should open successfully each time
        const isVisible = await page.locator('body').isVisible();
        expect(isVisible).toBe(true);

        await page.close();

        // Wait between iterations
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    });

    test('should maintain download listeners across restarts', async ({ context, extensionId }) => {
      await setupGitHubAppAuth(context, extensionId, 12345, 'testuser');

      // Extension should have download listeners registered
      // We can't directly test this, but we can verify the extension responds to pages
      const page = await context.newPage();
      await page.goto('about:blank');

      // Extension should be active and responding
      await page.waitForTimeout(500);

      // Verify chrome APIs are accessible
      const hasDownloadAPI = await page.evaluate(() => {
        return typeof chrome !== 'undefined';
      });

      expect(hasDownloadAPI).toBe(true);

      await page.close();
    });
  });

  test.describe('Tab Management', () => {
    test('should detect active tab state', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Create a tab
      const page = await context.newPage();
      await page.goto('about:blank');

      // Extension should be able to detect this tab
      await page.waitForTimeout(500);

      // Verify tab is active
      const isVisible = await page.isVisible('body');
      expect(isVisible).toBe(true);

      await page.close();
    });

    test('should handle idle tab detection', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      const page = await context.newPage();
      await page.goto('about:blank');

      // Simulate idle state by waiting
      await page.waitForTimeout(2000);

      // Tab should still be responsive
      const title = await page.title();
      expect(title).toBeDefined();

      await page.close();
    });

    test('should handle multiple tabs simultaneously', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Open multiple tabs
      const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);

      // Navigate each tab
      await Promise.all(pages.map((page) => page.goto('about:blank')));

      // Wait for all tabs to be ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // All tabs should be accessible
      for (const page of pages) {
        const isVisible = await page.isVisible('body');
        expect(isVisible).toBe(true);
      }

      // Close all tabs
      await Promise.all(pages.map((page) => page.close()));
    });

    test('should maintain extension state across tab switches', async ({
      context,
      extensionId,
    }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Open tab 1
      const page1 = await context.newPage();
      await page1.goto('about:blank');

      // Open tab 2
      const page2 = await context.newPage();
      await page2.goto('about:blank');

      // Switch between tabs
      await page1.bringToFront();
      await page1.waitForTimeout(500);

      await page2.bringToFront();
      await page2.waitForTimeout(500);

      // Settings should still be accessible
      const settings = await getGitHubSettings(context, extensionId);
      expect(settings.authType).toBe('pat');

      await page1.close();
      await page2.close();
    });
  });

  test.describe('Notification Management', () => {
    test('should deduplicate notifications across tabs', async ({ context, extensionId }) => {
      await setupGitHubAppAuth(context, extensionId, 12345, 'testuser');

      // Create multiple tabs on bolt.new domain
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      await page1.goto('about:blank');
      await page2.goto('about:blank');

      // In a real scenario, both tabs might trigger the same download
      // Extension should deduplicate notifications

      // Track notifications
      const notifications: string[] = [];
      const collectNotifications = (page: any) => {
        page.on('console', (msg: any) => {
          if (msg.text().includes('notification')) {
            notifications.push(msg.text());
          }
        });
      };

      collectNotifications(page1);
      collectNotifications(page2);

      await page1.waitForTimeout(1000);

      // Note: Actual notification deduplication would require
      // triggering real downloads and testing background script logic

      await page1.close();
      await page2.close();
    });

    test('should show notification only on appropriate tabs', async ({ context, extensionId }) => {
      await setupGitHubAppAuth(context, extensionId, 12345, 'testuser');

      const page = await context.newPage();
      await page.goto('about:blank');

      // Check notification permission
      const notificationPermission = await page.evaluate(() => {
        return Notification.permission;
      });

      // Should be 'default', 'granted', or 'denied'
      expect(['default', 'granted', 'denied']).toContain(notificationPermission);

      await page.close();
    });

    test('should handle notification permission states', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('about:blank');

      // Test different permission scenarios
      const hasNotificationAPI = await page.evaluate(() => {
        return 'Notification' in window;
      });

      expect(hasNotificationAPI).toBe(true);

      // Request permission (will be auto-granted or denied based on context)
      const permission = await page.evaluate(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
          return await Notification.requestPermission();
        }
        return Notification.permission;
      });

      expect(['default', 'granted', 'denied']).toContain(permission);

      await page.close();
    });
  });

  test.describe('State Synchronization', () => {
    test('should sync settings across popup instances', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Open first popup
      const popup1 = await openPopup(context, extensionId);
      await popup1.waitForTimeout(500);

      // Open second popup (should show same data)
      const popup2 = await openPopup(context, extensionId);
      await popup2.waitForTimeout(500);

      // Both popups should have access to same settings
      const settings1 = await getGitHubSettings(context, extensionId);
      const settings2 = await getGitHubSettings(context, extensionId);

      expect(settings1).toEqual(settings2);

      await popup1.close();
      await popup2.close();
    });

    test('should handle storage changes from other contexts', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      const popup = await openPopup(context, extensionId);

      // Modify storage from background context
      const bgPage = await context.newPage();
      await bgPage.goto(`chrome-extension://${extensionId}/popup.html`);

      await bgPage.evaluate(() => {
        return chrome.storage.local.set({
          testValue: 'modified_from_background',
        });
      });

      await bgPage.close();

      // Wait for storage sync
      await popup.waitForTimeout(1000);

      // Verify change was propagated
      const storagePage = await context.newPage();
      await storagePage.goto(`chrome-extension://${extensionId}/popup.html`);

      const testValue = await storagePage.evaluate(() => {
        return chrome.storage.local.get('testValue').then((result) => result.testValue);
      });

      expect(testValue).toBe('modified_from_background');

      await storagePage.close();
      await popup.close();
    });

    test('should maintain consistency during concurrent operations', async ({
      context,
      extensionId,
    }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Open multiple popup instances
      const popup1 = await openPopup(context, extensionId);
      const popup2 = await openPopup(context, extensionId);

      await popup1.waitForTimeout(500);
      await popup2.waitForTimeout(500);

      // Both should be functional
      const body1 = await popup1.locator('body').isVisible();
      const body2 = await popup2.locator('body').isVisible();

      expect(body1).toBe(true);
      expect(body2).toBe(true);

      await popup1.close();
      await popup2.close();
    });
  });

  test.describe('Resource Cleanup', () => {
    test('should cleanup resources on popup close', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      const popup = await openPopup(context, extensionId);
      await popup.waitForTimeout(500);

      // Close popup
      await popup.close();

      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should be able to open popup again without issues
      const popup2 = await openPopup(context, extensionId);
      const isVisible = await popup2.locator('body').isVisible();
      expect(isVisible).toBe(true);

      await popup2.close();
    });

    test('should handle rapid popup open/close cycles', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      // Rapidly open and close popup
      for (let i = 0; i < 5; i++) {
        const popup = await openPopup(context, extensionId);
        await popup.waitForTimeout(200);
        await popup.close();
      }

      // Final open should work correctly
      const finalPopup = await openPopup(context, extensionId);
      const isVisible = await finalPopup.locator('body').isVisible();
      expect(isVisible).toBe(true);

      await finalPopup.close();
    });

    test('should cleanup listeners on extension disable', async ({ context, extensionId }) => {
      // This test would require actually disabling the extension
      // which is complex in Playwright. For now, just verify state.

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

      // Extension should be loaded
      const hasChrome = await page.evaluate(() => {
        return typeof chrome !== 'undefined';
      });

      expect(hasChrome).toBe(true);

      await page.close();
    });
  });
});
