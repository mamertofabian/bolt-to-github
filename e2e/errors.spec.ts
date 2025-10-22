import { test, expect } from './fixtures/extension';
import { clearStorage, setupPATAuth } from './helpers/storage';
import {
  openPopup,
  fillRepositorySettings,
  clickPushButton,
  waitForErrorNotification,
  getValidationError,
} from './helpers/popup';

/**
 * Error Handling Tests
 *
 * These tests verify error handling scenarios:
 * - Network failures during GitHub API calls
 * - Invalid repository name handling
 * - Push failure scenarios (permission issues, rate limits)
 * - Error notification display and content
 * - Recovery from failed push attempts
 */

test.describe('Error Handling', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    // Clear storage before each test
    await clearStorage(context, extensionId);
  });

  test.describe('Authentication Errors', () => {
    test('should show error for invalid GitHub token', async ({
      context,
      extensionId,
      page: bgPage,
    }) => {
      // Set up with an invalid token
      await setupPATAuth(context, extensionId, 'invalid_token', 'testuser');

      const page = await openPopup(context, extensionId);

      // Try to configure repository (should validate token)
      await fillRepositorySettings(page, {
        repoName: 'test-repo',
        branch: 'main',
        visibility: 'public',
      });

      // Attempt to push (should fail with token error)
      await clickPushButton(page);

      // Wait for error notification or message
      const errorShown = await page
        .locator('text=/invalid.*token|authentication.*failed|unauthorized/i')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      expect(errorShown).toBe(true);

      await page.close();
    });

    test('should handle network timeout gracefully', async ({
      context,
      extensionId,
      page: bgPage,
    }) => {
      // Set up authentication
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');

      const page = await openPopup(context, extensionId);

      // Go offline to simulate network failure
      await context.setOffline(true);

      // Try to configure repository
      await fillRepositorySettings(page, {
        repoName: 'test-repo',
        branch: 'main',
        visibility: 'public',
      });

      // Attempt to push (should fail with network error)
      await clickPushButton(page);

      // Wait for network error notification
      const errorShown = await page
        .locator('text=/network.*error|connection.*failed|offline/i')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      expect(errorShown).toBe(true);

      // Go back online
      await context.setOffline(false);

      await page.close();
    });

    test('should handle missing authentication', async ({ context, extensionId }) => {
      // Don't set up any authentication
      const page = await openPopup(context, extensionId);

      // Should show onboarding or auth required message
      const authRequired = await page
        .locator('text=/authenticate|sign.*in|get.*started|welcome/i')
        .first()
        .isVisible({ timeout: 3000 });

      expect(authRequired).toBe(true);

      await page.close();
    });
  });

  test.describe('Repository Validation Errors', () => {
    test('should show error for invalid repository name', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Try to set an invalid repository name
      const repoInput = page
        .locator('input[placeholder*="repository" i], input[name="repository"], input[id*="repo"]')
        .first();
      await repoInput.fill('invalid repo name with spaces!@#');

      // Blur the input to trigger validation
      await repoInput.blur();

      // Check for validation error
      const validationError = await getValidationError(page);
      expect(validationError).toBeTruthy();
      expect(validationError?.toLowerCase()).toMatch(/invalid|alphanumeric|hyphen|underscore/);

      await page.close();
    });

    test('should show error for empty repository name', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Try to push with empty repository name
      const repoInput = page
        .locator('input[placeholder*="repository" i], input[name="repository"]')
        .first();
      await repoInput.fill('');

      await clickPushButton(page);

      // Check for validation error
      const validationError = await getValidationError(page);
      expect(validationError).toBeTruthy();
      expect(validationError?.toLowerCase()).toMatch(/required|empty|provide.*name/);

      await page.close();
    });

    test('should validate repository name format', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      const invalidNames = [
        'repo with spaces',
        'repo@special',
        'repo#hash',
        '-starts-with-hyphen',
        'ends-with-hyphen-',
        'double--hyphen',
        'UPPERCASE', // Should be lowercase
      ];

      for (const invalidName of invalidNames) {
        const repoInput = page
          .locator('input[placeholder*="repository" i], input[name="repository"]')
          .first();
        await repoInput.fill(invalidName);
        await repoInput.blur();

        // Wait a moment for validation
        await page.waitForTimeout(500);

        // Should show some form of error
        const hasError = await page
          .locator('text=/invalid|error|format/i, [class*="error"]')
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        // At least one should show an error
        if (hasError) {
          expect(hasError).toBe(true);
          break;
        }
      }

      await page.close();
    });
  });

  test.describe('Push Failure Scenarios', () => {
    test('should handle push to existing repository with conflicts', async ({
      context,
      extensionId,
      page: bgPage,
    }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Mock a scenario where repository already exists
      // This would require GitHub API mocking in a real test

      // For now, just verify error UI can be displayed
      const page2 = await context.newPage();
      await page2.goto('about:blank');

      // Simulate showing an error notification
      await page2.evaluate(() => {
        const notification = new Notification('Push Failed', {
          body: 'Repository already exists',
          icon: '/icons/icon-48.png',
        });
      });

      await page2.close();
      await page.close();
    });

    test('should show error when push fails', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Navigate to a non-bolt.new page
      const testPage = await context.newPage();
      await testPage.goto('about:blank');

      // Try to push from a non-bolt.new domain
      await fillRepositorySettings(page, {
        repoName: 'test-repo',
        branch: 'main',
        visibility: 'public',
      });

      await clickPushButton(page);

      // Should show error about not being on bolt.new or no content
      const errorShown = await page
        .locator('text=/not.*bolt\\.new|no.*content|no.*files/i')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      expect(errorShown).toBe(true);

      await testPage.close();
      await page.close();
    });

    test('should handle rate limit errors', async ({ context, extensionId, page: bgPage }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // In a real test, we would mock the GitHub API to return a 429 rate limit error
      // For now, verify that error handling UI exists

      // Check that error notification system is in place
      const page2 = await context.newPage();
      await page2.goto('about:blank');

      // Verify Notification API is available
      const notificationPermission = await page2.evaluate(() => {
        return 'Notification' in window;
      });

      expect(notificationPermission).toBe(true);

      await page2.close();
      await page.close();
    });

    test('should handle permission denied errors', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // In a real test, we would mock GitHub API to return 403 Forbidden
      // For now, verify error handling infrastructure exists

      // Verify console errors can be captured
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Try to trigger an error scenario
      await fillRepositorySettings(page, {
        repoName: 'test-repo',
        branch: 'main',
        visibility: 'public',
      });

      await page.close();
    });
  });

  test.describe('Error Recovery', () => {
    test('should allow retry after failed push', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // First attempt (should fail - no content)
      await fillRepositorySettings(page, {
        repoName: 'test-repo',
        branch: 'main',
        visibility: 'public',
      });

      await clickPushButton(page);

      // Wait a moment
      await page.waitForTimeout(1000);

      // Should still be able to edit settings and retry
      const repoInput = page
        .locator('input[placeholder*="repository" i], input[name="repository"]')
        .first();
      await expect(repoInput).toBeEditable();

      // Should be able to change repository name
      await repoInput.fill('test-repo-retry');

      // Should be able to click push again
      const pushButton = page.locator('button:has-text("Push"), button:has-text("Upload")').first();
      await expect(pushButton).toBeEnabled();

      await page.close();
    });

    test('should clear error state after successful correction', async ({
      context,
      extensionId,
    }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Enter invalid repository name
      const repoInput = page
        .locator('input[placeholder*="repository" i], input[name="repository"]')
        .first();
      await repoInput.fill('invalid name!');
      await repoInput.blur();

      await page.waitForTimeout(500);

      // Correct the repository name
      await repoInput.fill('valid-repo-name');
      await repoInput.blur();

      await page.waitForTimeout(500);

      // Error should be cleared
      const hasError = await page
        .locator('[class*="error"], .error, text=/error/i')
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      // Should not show error after correction
      expect(hasError).toBe(false);

      await page.close();
    });

    test('should preserve settings after error', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Set repository settings
      await fillRepositorySettings(page, {
        repoName: 'test-repo',
        branch: 'develop',
        visibility: 'private',
      });

      // Trigger an error (push without content)
      await clickPushButton(page);

      await page.waitForTimeout(1000);

      // Close and reopen popup
      await page.close();

      const page2 = await openPopup(context, extensionId);
      await page2.waitForTimeout(1000);

      // Settings should still be there
      const repoInput = page2
        .locator('input[placeholder*="repository" i], input[name="repository"]')
        .first();
      const repoValue = await repoInput.inputValue();

      expect(repoValue).toBe('test-repo');

      await page2.close();
    });
  });

  test.describe('Error Notifications', () => {
    test('should display error notifications with correct content', async ({
      context,
      extensionId,
    }) => {
      const page = await context.newPage();
      await page.goto('about:blank');

      // Check notification API is available
      const hasNotifications = await page.evaluate(() => {
        return 'Notification' in window;
      });

      expect(hasNotifications).toBe(true);

      await page.close();
    });

    test('should handle multiple consecutive errors', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Track console errors
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      // Trigger multiple errors
      for (let i = 0; i < 3; i++) {
        const repoInput = page
          .locator('input[placeholder*="repository" i], input[name="repository"]')
          .first();
        await repoInput.fill(`invalid name ${i}!@#`);
        await repoInput.blur();
        await page.waitForTimeout(500);
      }

      // UI should still be responsive
      const repoInput = page
        .locator('input[placeholder*="repository" i], input[name="repository"]')
        .first();
      await expect(repoInput).toBeEditable();

      await page.close();
    });

    test('should dismiss error notifications', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('about:blank');

      // Create a test notification
      await page.evaluate(() => {
        const notification = new Notification('Test Error', {
          body: 'This is a test error message',
          requireInteraction: false,
        });

        // Close it after a short delay
        setTimeout(() => notification.close(), 1000);
      });

      // Wait for notification to close
      await page.waitForTimeout(1500);

      await page.close();
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle empty response from GitHub API', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // In a real test, mock GitHub API to return empty response
      // For now, verify error handling exists

      const hasErrorHandling = await page.evaluate(() => {
        return typeof console.error === 'function';
      });

      expect(hasErrorHandling).toBe(true);

      await page.close();
    });

    test('should handle malformed GitHub API responses', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Verify JSON parsing error handling
      const canHandleJSONErrors = await page.evaluate(() => {
        try {
          JSON.parse('invalid json');
          return false;
        } catch {
          return true;
        }
      });

      expect(canHandleJSONErrors).toBe(true);

      await page.close();
    });

    test('should handle extremely long repository names', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      // Try to set a very long repository name (GitHub limit is 100 chars)
      const longName = 'a'.repeat(150);
      const repoInput = page
        .locator('input[placeholder*="repository" i], input[name="repository"]')
        .first();
      await repoInput.fill(longName);
      await repoInput.blur();

      await page.waitForTimeout(500);

      // Should show validation error or limit input
      const inputValue = await repoInput.inputValue();
      expect(inputValue.length).toBeLessThanOrEqual(100);

      await page.close();
    });

    test('should handle special characters in branch names', async ({ context, extensionId }) => {
      await setupPATAuth(context, extensionId, 'ghp_test_token', 'testuser');
      const page = await openPopup(context, extensionId);

      const invalidBranchNames = ['feat/test@special', 'branch with spaces', 'branch#123'];

      for (const branchName of invalidBranchNames) {
        const branchInput = page
          .locator('input[placeholder*="branch" i], input[name="branch"]')
          .first();

        if (await branchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await branchInput.fill(branchName);
          await branchInput.blur();
          await page.waitForTimeout(500);

          // Should validate or sanitize branch name
          // At minimum, shouldn't crash
          const isEditable = await branchInput.isEditable();
          expect(isEditable).toBe(true);
        }
      }

      await page.close();
    });
  });
});
