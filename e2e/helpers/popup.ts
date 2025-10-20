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

/**
 * Fill in the onboarding form with PAT authentication
 */
export async function fillOnboardingPAT(
  page: Page,
  token: string,
  username: string
): Promise<void> {
  // Click "Connect GitHub Account" button if on welcome screen
  const connectButton = page.locator('button:has-text("Connect GitHub Account")');
  if (await connectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await connectButton.click();
    await page.waitForTimeout(1000);
  }

  // Select PAT radio button - the fields only appear when this is selected
  // Wait for the authentication method selection screen to load
  const patRadio = page.locator('input[type="radio"][value="pat"]');
  await patRadio.waitFor({ state: 'visible', timeout: 10000 });
  await patRadio.click();

  // Wait for PAT fields to appear
  await page.waitForTimeout(500);

  // Fill in the token field (ID is 'githubToken')
  const tokenInput = page.locator('#githubToken');
  await tokenInput.waitFor({ state: 'visible', timeout: 5000 });
  await tokenInput.fill(token);

  // Fill in the username field (ID is 'repoOwner')
  const usernameInput = page.locator('#repoOwner');
  await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
  await usernameInput.fill(username);
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
 * Fill repository settings in the Home tab
 */
export async function fillRepositorySettings(
  page: Page,
  repoName: string,
  branch: string = 'main'
): Promise<void> {
  // Fill in repository name
  const repoInput = page
    .locator('input[placeholder*="repository" i], input[name*="repo" i]')
    .first();
  await repoInput.waitFor({ state: 'visible', timeout: 5000 });
  await repoInput.clear();
  await repoInput.fill(repoName);

  // Fill in branch name if there's a branch input
  const branchInput = page
    .locator('input[placeholder*="branch" i], input[name*="branch" i]')
    .first();
  if (await branchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await branchInput.clear();
    await branchInput.fill(branch);
  }
}

/**
 * Click the push button
 */
export async function clickPushButton(page: Page): Promise<void> {
  const pushButton = page.locator('button:has-text("Push"), button:has-text("Upload")').first();
  await pushButton.waitFor({ state: 'visible', timeout: 5000 });
  await pushButton.click();
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
  const errorIndicator = page.locator('text=/Error|Failed|Invalid/i, [role="alert"]').first();
  await errorIndicator.waitFor({ state: 'visible', timeout: 10000 });
  return errorIndicator.textContent() || 'Unknown error';
}

/**
 * Check if validation error is showing
 */
export async function getValidationError(page: Page): Promise<string | null> {
  const errorMessage = page
    .locator('[class*="error"], [role="alert"], .text-red-500, .text-destructive')
    .first();
  if (await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
    return errorMessage.textContent();
  }
  return null;
}
