import type { BrowserContext } from '@playwright/test';

/**
 * Helper utilities for manipulating Chrome extension storage in E2E tests
 */

export interface GitHubSettings {
  githubToken?: string;
  repoOwner?: string;
  projectSettings?: Record<string, { repoName: string; branch: string; projectTitle?: string }>;
  authenticationMethod?: 'pat' | 'github_app';
  githubAppInstallationId?: number;
  githubAppUsername?: string;
  githubAppAvatarUrl?: string;
}

export interface LocalSettings {
  authenticationMethod?: 'pat' | 'github_app';
  githubAppInstallationId?: number;
  githubAppUsername?: string;
  githubAppAvatarUrl?: string;
}

/**
 * Set GitHub settings in extension storage
 */
export async function setGitHubSettings(
  context: BrowserContext,
  extensionId: string,
  settings: GitHubSettings
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

  await page.evaluate((settingsToSet) => {
    // Set sync storage settings
    const syncSettings: Record<string, unknown> = {};
    if (settingsToSet.githubToken !== undefined)
      syncSettings.githubToken = settingsToSet.githubToken;
    if (settingsToSet.repoOwner !== undefined) syncSettings.repoOwner = settingsToSet.repoOwner;
    if (settingsToSet.projectSettings !== undefined)
      syncSettings.projectSettings = settingsToSet.projectSettings;

    // Set local storage settings
    const localSettings: Record<string, unknown> = {};
    if (settingsToSet.authenticationMethod !== undefined)
      localSettings.authenticationMethod = settingsToSet.authenticationMethod;
    if (settingsToSet.githubAppInstallationId !== undefined)
      localSettings.githubAppInstallationId = settingsToSet.githubAppInstallationId;
    if (settingsToSet.githubAppUsername !== undefined)
      localSettings.githubAppUsername = settingsToSet.githubAppUsername;
    if (settingsToSet.githubAppAvatarUrl !== undefined)
      localSettings.githubAppAvatarUrl = settingsToSet.githubAppAvatarUrl;

    return Promise.all([
      Object.keys(syncSettings).length > 0
        ? chrome.storage.sync.set(syncSettings)
        : Promise.resolve(),
      Object.keys(localSettings).length > 0
        ? chrome.storage.local.set(localSettings)
        : Promise.resolve(),
    ]);
  }, settings);

  await page.close();
}

/**
 * Get GitHub settings from extension storage
 */
export async function getGitHubSettings(
  context: BrowserContext,
  extensionId: string
): Promise<GitHubSettings> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

  const settings = await page.evaluate(async () => {
    const syncData = await chrome.storage.sync.get(['githubToken', 'repoOwner', 'projectSettings']);
    const localData = await chrome.storage.local.get([
      'authenticationMethod',
      'githubAppInstallationId',
      'githubAppUsername',
      'githubAppAvatarUrl',
    ]);

    return {
      ...syncData,
      ...localData,
    };
  });

  await page.close();
  return settings as GitHubSettings;
}

/**
 * Clear all extension storage
 */
export async function clearStorage(context: BrowserContext, extensionId: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

  await page.evaluate(async () => {
    await Promise.all([chrome.storage.sync.clear(), chrome.storage.local.clear()]);
  });

  await page.close();
}

/**
 * Set up authenticated state with Personal Access Token
 */
export async function setupPATAuth(
  context: BrowserContext,
  extensionId: string,
  token: string,
  username: string
): Promise<void> {
  await setGitHubSettings(context, extensionId, {
    githubToken: token,
    repoOwner: username,
    authenticationMethod: 'pat',
  });
}

/**
 * Set up authenticated state with GitHub App
 */
export async function setupGitHubAppAuth(
  context: BrowserContext,
  extensionId: string,
  installationId: number,
  username: string,
  avatarUrl?: string
): Promise<void> {
  await setGitHubSettings(context, extensionId, {
    authenticationMethod: 'github_app',
    githubAppInstallationId: installationId,
    githubAppUsername: username,
    githubAppAvatarUrl: avatarUrl,
    repoOwner: username,
  });
}
