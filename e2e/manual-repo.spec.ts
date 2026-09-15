import { test, expect } from './fixtures/extension';
import { clearStorage, seedConnectedGitHubApp } from './helpers/storage';
import {
  fillRepositorySettings,
  getValidationError,
  openPopup,
  openProjectRepositorySettings,
  waitForMigrationGuidance,
} from './helpers/popup';

const MANUAL_PROJECT_ID = 'manual-repository-project';
const MANUAL_REPOSITORY_NAME = 'app-connected-repository';

async function openManualProjectSettings(
  context: Parameters<typeof seedConnectedGitHubApp>[0],
  extensionId: string
) {
  await seedConnectedGitHubApp(context, extensionId, {
    projectSettings: {
      [MANUAL_PROJECT_ID]: {
        repoName: MANUAL_REPOSITORY_NAME,
        branch: 'main',
        projectTitle: 'Manual Repository Project',
      },
    },
  });
  const page = await openPopup(context, extensionId);
  await expect(page.getByRole('tablist')).toBeVisible();
  await openProjectRepositorySettings(page, MANUAL_REPOSITORY_NAME);
  return page;
}

test.describe('GitHub App-only manual repository management', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await clearStorage(context, extensionId);
  });

  test('connected users can open repository settings', async ({ context, extensionId }) => {
    const page = await openManualProjectSettings(context, extensionId);

    await expect(page.getByRole('heading', { name: /repository settings/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save settings/i })).toBeVisible();

    await page.close();
  });

  test('repository validation remains available through the App connection', async ({
    context,
    extensionId,
  }) => {
    const page = await openManualProjectSettings(context, extensionId);

    await fillRepositorySettings(page, {
      repoName: 'invalid repository name!',
      branch: 'main',
      visibility: 'private',
    });

    const validationError = await getValidationError(page);
    expect(validationError?.toLowerCase()).toMatch(/invalid|repository|character/);
    await expect(page.getByRole('button', { name: /save settings/i })).toBeDisabled();

    await page.close();
  });

  test('connected users can configure a custom branch', async ({ context, extensionId }) => {
    const page = await openManualProjectSettings(context, extensionId);

    await fillRepositorySettings(page, {
      repoName: 'app-connected-repository',
      branch: 'feature/github-app-only',
      visibility: 'private',
    });

    const branchInput = page
      .locator(
        'input[placeholder*="branch" i]:visible, input[name*="branch" i]:visible, #branch:visible'
      )
      .first();
    await expect(branchInput).toHaveValue('feature/github-app-only');

    await page.close();
  });

  test('legacy migration state cannot enter repository management', async ({
    context,
    extensionId,
  }) => {
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async () => {
      await Promise.all([
        chrome.storage.sync.set({
          repoOwner: 'legacy-owner',
          projectSettings: {
            legacy: { repoName: 'preserved-repository', branch: 'main' },
          },
        }),
        chrome.storage.local.set({ githubAppMigrationRequired: true }),
      ]);
    });

    const page = await openPopup(context, extensionId);
    await expect(waitForMigrationGuidance(page)).resolves.toContain(
      'Personal access token support has ended'
    );
    await expect(page.getByRole('tablist')).toBeHidden();
    await expect(page.getByRole('button', { name: /save settings/i })).toBeHidden();

    await page.close();
  });
});
