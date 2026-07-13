import { test, expect } from './fixtures/extension';
import type { BrowserContext } from '@playwright/test';
import { clearStorage, seedConnectedGitHubApp } from './helpers/storage';
import {
  openPopup,
  navigateToTab,
  fillRepositorySettings,
  clickPushButton,
  waitForErrorNotification,
  getValidationError,
} from './helpers/popup';

const ERROR_FLOW_PROJECT_ID = 'error-flow-project';
const PUSH_BUTTON_SELECTOR =
  'button[aria-label="Push to GitHub"]:visible, button:visible:has-text("Push to GitHub"), button:visible:has-text("Upload")';

async function seedProductAuth(
  context: BrowserContext,
  extensionId: string,
  repoName = 'test-repo'
) {
  await seedConnectedGitHubApp(context, extensionId, {
    repoOwner: 'testuser',
    projectSettings: {
      [ERROR_FLOW_PROJECT_ID]: {
        repoName,
        branch: 'main',
        projectTitle: 'Error Flow Project',
      },
    },
  });
}

async function openSettingsForRepositoryValidation(context: BrowserContext, extensionId: string) {
  await seedProductAuth(context, extensionId);
  const page = await openPopup(context, extensionId);
  await navigateToTab(page, 'Settings');
  return page;
}

async function openPopupForBoltProject(
  context: BrowserContext,
  extensionId: string,
  repoName = 'test-repo'
) {
  await seedProductAuth(context, extensionId, repoName);

  await context.route('https://api.github.com/users/testuser', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ login: 'testuser' }),
    });
  });

  await context.route('https://bolt.new/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><title>Bolt Project</title><body>Error Flow Project</body></html>',
    });
  });

  const boltPage = await context.newPage();
  await boltPage.goto(`https://bolt.new/~/${ERROR_FLOW_PROJECT_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  await boltPage.bringToFront();

  const page = await openPopup(context, extensionId);

  for (let attempt = 0; attempt < 3; attempt++) {
    await boltPage.bringToFront();
    await page.evaluate(async (projectUrl) => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const boltTab = tabs.find((tab) => tab.url?.includes(projectUrl));

      if (boltTab?.id === undefined) {
        throw new Error(`Unable to find the Bolt project tab for ${projectUrl}`);
      }

      await chrome.tabs.update(boltTab.id, { active: true });
    }, `bolt.new/~/${ERROR_FLOW_PROJECT_ID}`);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return activeTab?.url ?? '';
          }),
        { timeout: 5_000 }
      )
      .toContain(`bolt.new/~/${ERROR_FLOW_PROJECT_ID}`);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const pushVisible = await page
      .locator(PUSH_BUTTON_SELECTOR)
      .first()
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (pushVisible) break;
  }

  return { page, boltPage };
}

test.describe('Product-visible error flows', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await clearStorage(context, extensionId);
  });

  test('should show error for invalid repository name', async ({ context, extensionId }) => {
    const page = await openSettingsForRepositoryValidation(context, extensionId);

    await fillRepositorySettings(page, {
      repoName: 'invalid repo name with spaces!@#',
      branch: 'main',
      visibility: 'public',
    });

    const validationError = await getValidationError(page);
    expect(validationError).toBeTruthy();
    expect(validationError?.toLowerCase()).toMatch(/invalid|alphanumeric|hyphen|underscore/);

    await page.close();
  });

  test('should show error for empty repository name', async ({ context, extensionId }) => {
    const page = await openSettingsForRepositoryValidation(context, extensionId);

    await fillRepositorySettings(page, {
      repoName: '',
      branch: 'main',
      visibility: 'public',
    });

    const validationError = await getValidationError(page);
    expect(validationError).toBeTruthy();
    expect(validationError?.toLowerCase()).toMatch(/required|empty|provide.*name/);
    await expect(page.getByRole('button', { name: /save settings/i })).toBeDisabled();

    await page.close();
  });

  test('should validate repository name format', async ({ context, extensionId }) => {
    const page = await openSettingsForRepositoryValidation(context, extensionId);

    const invalidNames = [
      'repo with spaces',
      'repo@special',
      'repo#hash',
      '-starts-with-hyphen',
      'ends-with-hyphen-',
      'double--hyphen',
    ];

    for (const invalidName of invalidNames) {
      await fillRepositorySettings(page, {
        repoName: invalidName,
        branch: 'main',
        visibility: 'public',
      });

      await page.waitForTimeout(500);

      const validationError = await getValidationError(page);
      expect(validationError, `Expected validation error for "${invalidName}"`).toBeTruthy();
      expect(validationError?.toLowerCase()).toMatch(/invalid|repository|hyphen|character/);
    }

    await page.close();
  });

  test('should show error when push fails', async ({ context, extensionId }) => {
    const { page, boltPage } = await openPopupForBoltProject(context, extensionId);

    await clickPushButton(page, () => boltPage.close());

    const errorShown = await page
      .locator(
        '[role="alert"]:visible, [aria-live="assertive"]:visible, [aria-live="polite"]:visible'
      )
      .filter({ hasText: /not.*bolt\.new|no.*content|no.*files|content script/i })
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(errorShown).toBe(true);

    await page.close();
  });

  test('should allow retry after failed push', async ({ context, extensionId }) => {
    const { page, boltPage } = await openPopupForBoltProject(context, extensionId);

    await clickPushButton(page, () => boltPage.close());
    await clickPushButton(page);

    const retryError = await waitForErrorNotification(page);
    expect(retryError.toLowerCase()).toMatch(/failed|error|no.*content|not.*bolt/);

    await page.close();
  });
});
