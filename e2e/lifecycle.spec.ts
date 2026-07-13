import { test, expect } from './fixtures/extension';
import { clearStorage, getGitHubSettings, seedConnectedGitHubApp } from './helpers/storage';
import { openGitHubAppSetup, openPopup, waitForMigrationGuidance } from './helpers/popup';

test.describe('GitHub App-only extension lifecycle', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await clearStorage(context, extensionId);
  });

  test('fresh install stays on passive onboarding without opening sign-in tabs', async ({
    context,
    extensionId,
  }) => {
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
    await expect(page.getByRole('heading', { name: /welcome to bolt to github/i })).toBeVisible();
    await expect(page.getByRole('tablist')).toBeHidden();
    expect(automaticAuthNavigations).toEqual([]);

    const settings = await getGitHubSettings(context, extensionId);
    expect(settings.githubAppInstallationId).toBeUndefined();
    expect(settings.repoOwner).toBeUndefined();

    await page.close();
  });

  test('connected App identity and project mappings survive popup restarts', async ({
    context,
    extensionId,
  }) => {
    await seedConnectedGitHubApp(context, extensionId, {
      projectSettings: {
        'persistent-project': {
          repoName: 'persistent-repository',
          branch: 'develop',
          projectTitle: 'Persistent Project',
        },
      },
    });

    const firstPopup = await openPopup(context, extensionId);
    await expect(firstPopup.getByRole('tablist')).toBeVisible();
    await firstPopup.close();

    const secondPopup = await openPopup(context, extensionId);
    await expect(secondPopup.getByRole('tablist')).toBeVisible();

    const settings = await getGitHubSettings(context, extensionId);
    expect(settings.githubAppInstallationId).toBe(12345);
    expect(settings.repoOwner).toBe('testuser');
    expect(settings.projectSettings?.['persistent-project']).toEqual({
      repoName: 'persistent-repository',
      branch: 'develop',
      projectTitle: 'Persistent Project',
    });

    await secondPopup.close();
  });

  test('signed-out state blocks tabs even when stale installation metadata existed', async ({
    context,
    extensionId,
  }) => {
    await seedConnectedGitHubApp(context, extensionId);
    const authPage = await context.newPage();
    await authPage.goto(`chrome-extension://${extensionId}/src/pages/logs.html`);
    const logoutResponse = await authPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' })
    );
    await authPage.close();
    expect(logoutResponse.success).toBe(true);

    const page = await openPopup(context, extensionId);
    await openGitHubAppSetup(page);
    await expect(page.getByRole('button', { name: /sign in to bolt2github/i })).toBeVisible();
    await expect(page.getByRole('tablist')).toBeHidden();

    await page.close();
  });

  test('incomplete installation remains blocked until the GitHub App is connected', async ({
    context,
    extensionId,
  }) => {
    await seedConnectedGitHubApp(context, extensionId);
    await context.route('**/functions/v1/get-github-token', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'NO_GITHUB_APP' }),
      });
    });

    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => {
      await chrome.storage.local.remove([
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAvatarUrl',
        'githubAppAccessToken',
        'githubAppExpiresAt',
        'githubConnectionPopupVerification',
      ]);
    });

    const page = await openPopup(context, extensionId);
    await openGitHubAppSetup(page);
    await expect(page.getByRole('button', { name: /connect github app/i })).toBeVisible();
    await expect(page.getByRole('tablist')).toBeHidden();

    await page.close();
  });

  test('migration-required state remains deterministic across popup reopens', async ({
    context,
    extensionId,
  }) => {
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => {
      await Promise.all([
        chrome.storage.sync.set({
          repoOwner: 'migration-owner',
          projectSettings: {
            migration: { repoName: 'migration-repo', branch: 'main' },
          },
        }),
        chrome.storage.local.set({ githubAppMigrationRequired: true }),
      ]);
    });

    let page = await openPopup(context, extensionId);
    await expect(waitForMigrationGuidance(page)).resolves.toContain(
      'Personal access token support has ended'
    );
    await page.close();

    page = await openPopup(context, extensionId);
    await expect(waitForMigrationGuidance(page)).resolves.toContain(
      'Personal access token support has ended'
    );
    await expect(page.getByRole('tablist')).toBeHidden();

    const settings = await getGitHubSettings(context, extensionId);
    expect(settings.githubAppMigrationRequired).toBe(true);
    expect(settings.projectSettings?.migration.repoName).toBe('migration-repo');

    await page.close();
  });
});
