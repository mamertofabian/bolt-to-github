import { test, expect } from './fixtures/extension';
import {
  clearStorage,
  getGitHubSettings,
  seedConnectedGitHubApp,
  seedLegacyPatMigration,
} from './helpers/storage';
import {
  isOnboardingVisible,
  openGitHubAppSetup,
  openPopup,
  waitForMigrationGuidance,
  waitForOnboardingComplete,
} from './helpers/popup';

const MIGRATION_PROJECT_ID = 'legacy-bolt-project';

test.describe('GitHub App-only authentication flow', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await clearStorage(context, extensionId);
  });

  test('first launch requires Bolt2GitHub sign-in and the GitHub App', async ({
    context,
    extensionId,
  }) => {
    const page = await openPopup(context, extensionId);

    expect(await isOnboardingVisible(page)).toBe(true);
    await expect(page.getByRole('heading', { name: /welcome to bolt to github/i })).toBeVisible();
    await expect(page.getByRole('tablist')).toBeHidden();

    await openGitHubAppSetup(page);
    await expect(page.getByText('GitHub App Required')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in to bolt2github/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    await page.close();
  });

  test('connected GitHub App state persists without legacy authentication fields', async ({
    context,
    extensionId,
  }) => {
    await seedConnectedGitHubApp(context, extensionId, {
      installationId: 67890,
      username: 'connected-user',
      repoOwner: 'connected-user',
      avatarUrl: 'https://avatars.githubusercontent.com/u/67890',
    });

    let page = await openPopup(context, extensionId);
    await waitForOnboardingComplete(page);
    await page.close();

    page = await openPopup(context, extensionId);
    await waitForOnboardingComplete(page);

    const settings = await getGitHubSettings(context, extensionId);
    expect(settings.githubAppInstallationId).toBe(67890);
    expect(settings.githubAppUsername).toBe('connected-user');
    expect(settings.repoOwner).toBe('connected-user');
    expect(settings.supabaseAuthState?.isAuthenticated).toBe(true);

    const legacyStorage = await page.evaluate(async () => {
      const [sync, local] = await Promise.all([
        chrome.storage.sync.get('githubToken'),
        chrome.storage.local.get('authenticationMethod'),
      ]);
      return { sync, local };
    });
    expect(legacyStorage).toEqual({ sync: {}, local: {} });

    await page.close();
  });

  test('legacy PAT migration preserves project settings and blocks GitHub until App connection', async ({
    context,
    extensionId,
  }) => {
    await seedLegacyPatMigration(context, extensionId, {
      repoOwner: 'legacy-owner',
      projectSettings: {
        [MIGRATION_PROJECT_ID]: {
          repoName: 'preserved-repository',
          branch: 'develop',
          projectTitle: 'Preserved Project',
        },
      },
    });

    const automaticAuthNavigations: string[] = [];
    context.on('page', (openedPage) => {
      openedPage.on('framenavigated', (frame) => {
        if (
          frame === openedPage.mainFrame() &&
          /bolt2github\.com\/(?:login|onboarding)/.test(frame.url())
        ) {
          automaticAuthNavigations.push(frame.url());
        }
      });
    });

    const page = await openPopup(context, extensionId);
    const migrationGuidance = await waitForMigrationGuidance(page);
    const normalizedMigrationGuidance = migrationGuidance.replace(/\s+/g, ' ');

    expect(normalizedMigrationGuidance).toContain('Personal access token support has ended');
    expect(normalizedMigrationGuidance).toContain(
      'Your repository and project settings have been preserved'
    );
    await expect(page.getByRole('tablist')).toBeHidden();
    expect(automaticAuthNavigations).toEqual([]);

    const migratedStorage = await page.evaluate(async () => {
      const [sync, local] = await Promise.all([
        chrome.storage.sync.get(['githubToken', 'repoOwner', 'projectSettings']),
        chrome.storage.local.get(['authenticationMethod', 'githubAppMigrationRequired']),
      ]);
      return { sync, local };
    });
    expect(migratedStorage.sync.githubToken).toBeUndefined();
    expect(migratedStorage.local.authenticationMethod).toBeUndefined();
    expect(migratedStorage.local.githubAppMigrationRequired).toBe(true);
    expect(migratedStorage.sync.repoOwner).toBe('legacy-owner');
    expect(migratedStorage.sync.projectSettings[MIGRATION_PROJECT_ID]).toEqual({
      repoName: 'preserved-repository',
      branch: 'develop',
      projectTitle: 'Preserved Project',
    });

    await seedConnectedGitHubApp(context, extensionId, {
      repoOwner: 'legacy-owner',
      projectSettings: migratedStorage.sync.projectSettings,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForOnboardingComplete(page);

    const completedSettings = await getGitHubSettings(context, extensionId);
    expect(completedSettings.githubAppMigrationRequired).toBeUndefined();
    expect(completedSettings.projectSettings?.[MIGRATION_PROJECT_ID]).toEqual({
      repoName: 'preserved-repository',
      branch: 'develop',
      projectTitle: 'Preserved Project',
    });

    await page.close();
  });
});
