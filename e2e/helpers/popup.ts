import type { BrowserContext, Page } from '@playwright/test';

/**
 * Helper utilities for interacting with the extension popup in E2E tests
 */

/**
 * Open the extension popup
 */
export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html`;
  const page = await context.newPage();
  await page.goto(popupUrl);

  // Wait for the page to be fully loaded
  await page.waitForLoadState('domcontentloaded');

  return page;
}

export async function openGitHubAppSetup(page: Page): Promise<void> {
  const setupHeading = page.getByRole('heading', { name: /connect your github account/i });
  if (await setupHeading.isVisible().catch(() => false)) return;

  const connectButton = page.getByRole('button', { name: /connect github account/i });
  await connectButton.waitFor({ state: 'visible', timeout: 10_000 });
  await connectButton.click();

  await setupHeading.waitFor({
    state: 'visible',
    timeout: 10_000,
  });
}

export async function waitForMigrationGuidance(page: Page): Promise<string> {
  await openGitHubAppSetup(page);
  const migrationAlert = page.getByRole('alert').filter({
    hasText: /personal access token support has ended/i,
  });
  await migrationAlert.waitFor({ state: 'visible', timeout: 10_000 });
  return (await migrationAlert.textContent()) ?? '';
}

/**
 * Click the save/continue button in onboarding
 */
export async function clickSaveButton(page: Page): Promise<void> {
  const saveButton = page
    .locator(
      'button:has-text("Complete Setup"), button:has-text("Save"), button:has-text("Continue"), button:has-text("Next")'
    )
    .first();
  await saveButton.waitFor({ state: 'visible', timeout: 5000 });
  await saveButton.click();
}

/**
 * Wait for onboarding completion (tabs view appears)
 */
export async function waitForOnboardingComplete(page: Page): Promise<void> {
  // Wait for the tabs to appear (indicates onboarding is complete)
  await page.locator('[role="tablist"], .tabs, nav[aria-label*="tab" i]').waitFor({
    state: 'visible',
    timeout: 10000,
  });
}

/**
 * Check if onboarding is showing
 */
export async function isOnboardingVisible(page: Page): Promise<boolean> {
  const onboardingIndicator = page.locator('text=/Welcome|Get Started|Setup/i').first();
  return onboardingIndicator.isVisible({ timeout: 2000 }).catch(() => false);
}

/**
 * Navigate to a specific tab in the popup
 */
export async function navigateToTab(
  page: Page,
  tabName: 'Home' | 'Settings' | 'Help'
): Promise<void> {
  const tab = page
    .locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`)
    .first();
  await tab.waitFor({ state: 'visible', timeout: 5000 });
  await tab.click();
  await page.waitForTimeout(300);
}

/**
 * Open the authoritative repository settings modal for a mapped Bolt project.
 */
export async function openProjectRepositorySettings(
  page: Page,
  repositoryName: string
): Promise<void> {
  const projectsTab = page
    .locator('[role="tab"]:has-text("Projects"), button:has-text("Projects")')
    .first();
  await projectsTab.waitFor({ state: 'visible', timeout: 5000 });
  await projectsTab.click();
  await page.waitForTimeout(300);

  const projectCard = page
    .getByRole('button', { name: `Bolt project ${repositoryName}`, exact: true })
    .first();
  await projectCard.waitFor({ state: 'visible', timeout: 10_000 });
  await projectCard.hover();

  const settingsAction = projectCard.getByRole('button', {
    name: /repository settings/i,
  });
  await settingsAction.waitFor({ state: 'visible', timeout: 5000 });
  await settingsAction.click();

  await page
    .getByRole('heading', { name: /repository settings/i })
    .waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Fill repository settings in the Home tab
 */
type RepositorySettingsInput = {
  repoName: string;
  branch?: string;
  visibility?: 'public' | 'private';
};

export async function fillRepositorySettings(
  page: Page,
  settings: RepositorySettingsInput
): Promise<void> {
  const { repoName, branch = 'main', visibility } = settings;

  // Fill in repository name
  const repoInput = page
    .locator(
      'input[placeholder*="repository" i]:visible, input[name*="repo" i]:visible, #repoName:visible'
    )
    .first();
  await repoInput.waitFor({ state: 'visible', timeout: 5000 });
  await repoInput.clear();
  if (repoName) {
    await repoInput.pressSequentially(repoName);
  }
  await page.keyboard.press('Tab');

  // Fill in branch name if there's a branch input
  const branchInput = page
    .locator(
      'input[placeholder*="branch" i]:visible, input[name*="branch" i]:visible, #branch:visible'
    )
    .first();
  if (await branchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await branchInput.clear();
    await branchInput.fill(branch);
  }

  if (visibility) {
    const visibilityInput = page
      .locator(`input[type="radio"][value="${visibility}"]:visible`)
      .first();
    if (await visibilityInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await visibilityInput.click();
    }
  }
}

/**
 * Click the push button
 */
export async function clickPushButton(
  page: Page,
  beforeClick: (() => Promise<void>) | undefined = undefined
): Promise<void> {
  const pushButton = page
    .locator(
      'button[aria-label="Push to GitHub"]:visible, button:visible:has-text("Push to GitHub"), button:visible:has-text("Upload")'
    )
    .first();
  await pushButton.waitFor({ state: 'visible', timeout: 5000 });
  if (beforeClick) {
    await beforeClick();
  }
  await pushButton.click();

  for (const contextPage of page.context().pages()) {
    const confirmButton = contextPage.getByRole('button', { name: /push changes/i }).first();
    if (await confirmButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await confirmButton.click();
      break;
    }
  }
}

/**
 * Wait for success notification
 */
export async function waitForSuccessNotification(page: Page): Promise<void> {
  const successIndicator = page.locator('text=/Success|Pushed|Uploaded|Complete/i').first();
  await successIndicator.waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Wait for error notification
 */
export async function waitForErrorNotification(page: Page): Promise<string> {
  const errorIndicator = page
    .locator(
      '[role="alert"]:visible, [aria-live="assertive"]:visible, [aria-live="polite"]:visible'
    )
    .filter({ hasText: /Error|Failed|Invalid|No active Bolt tab|content script|no content/i })
    .first();
  await errorIndicator.waitFor({ state: 'visible', timeout: 10000 });
  return (await errorIndicator.textContent()) || 'Unknown error';
}

/**
 * Check if validation error is showing
 */
export async function getValidationError(page: Page): Promise<string | null> {
  const errorMessage = page
    .locator(
      'div:has(> h2:text-is("Repository Settings")) [role="alert"]:visible, [aria-live="assertive"]:visible, [aria-live="polite"]:visible'
    )
    .first();
  if (await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
    return errorMessage.textContent();
  }
  return null;
}
