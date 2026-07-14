import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import {
  clickPushButton,
  fillRepositorySettings,
  getValidationError,
  openProjectRepositorySettings,
  waitForErrorNotification,
} from '../../../e2e/helpers/popup';
import { test as extensionTest } from '../../../e2e/fixtures/extension';
import {
  seedConnectedGitHubApp,
  seedLegacyPatMigration,
  type GitHubAppE2ESettings,
  type LegacyPatE2ESettings,
} from '../../../e2e/helpers/storage';

vi.mock('@playwright/test', () => ({
  test: {
    extend: vi.fn((fixtures: unknown) => ({ __fixtures: fixtures })),
  },
  chromium: {
    launchPersistentContext: vi.fn(),
  },
  expect: vi.fn(),
}));

type LocatorFake = {
  first: () => LocatorFake;
  waitFor: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  pressSequentially: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  hover: ReturnType<typeof vi.fn>;
  getByRole: ReturnType<typeof vi.fn>;
  filter: ReturnType<typeof vi.fn>;
  textContent: ReturnType<typeof vi.fn>;
};

function createLocator(options: { visible?: boolean; text?: string } = {}): LocatorFake {
  const locator = {} as LocatorFake;
  locator.first = () => locator;
  locator.waitFor = vi.fn().mockResolvedValue(undefined);
  locator.clear = vi.fn().mockResolvedValue(undefined);
  locator.pressSequentially = vi.fn().mockResolvedValue(undefined);
  locator.fill = vi.fn().mockResolvedValue(undefined);
  locator.isVisible = vi.fn().mockResolvedValue(options.visible ?? true);
  locator.click = vi.fn().mockResolvedValue(undefined);
  locator.hover = vi.fn().mockResolvedValue(undefined);
  locator.getByRole = vi.fn().mockReturnValue(locator);
  locator.filter = vi.fn().mockReturnValue(locator);
  locator.textContent = vi.fn().mockResolvedValue(options.text ?? null);

  return locator;
}

describe('popup E2E helper characterization', () => {
  it('product auth helper seeds GitHub App session and installation without PAT', () => {
    const connectedOverrides: GitHubAppE2ESettings = {
      userId: 'release-user',
      email: 'release@example.com',
      installationId: 12345,
      username: 'testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      repoOwner: 'release-owner',
      projectSettings: {
        releaseProject: { repoName: 'release-repo', branch: 'main' },
      },
    };
    const storageHelper = readFileSync(join(process.cwd(), 'e2e/helpers/storage.ts'), 'utf8');
    const errorFlowSpec = readFileSync(
      join(process.cwd(), 'e2e/error-flow-product.spec.ts'),
      'utf8'
    );

    expect(seedConnectedGitHubApp).toBeTypeOf('function');
    expect(connectedOverrides.userId).toBe('release-user');
    expect(connectedOverrides.email).toBe('release@example.com');
    expect(connectedOverrides.installationId).toBe(12345);
    expect(connectedOverrides.username).toBe('testuser');
    expect(connectedOverrides.avatarUrl).toContain('avatars.githubusercontent.com');
    expect(connectedOverrides.repoOwner).toBe('release-owner');
    expect(connectedOverrides.projectSettings?.releaseProject).toMatchObject({
      repoName: 'release-repo',
      branch: 'main',
    });
    expect(connectedOverrides).not.toHaveProperty('githubToken');
    expect(storageHelper).toContain('export async function seedConnectedGitHubApp');
    expect(storageHelper).toContain('supabaseAuthState');
    expect(storageHelper).toContain('githubAppInstallationId');
    expect(storageHelper).toContain('githubConnectionPopupVerification');
    expect(storageHelper).not.toContain('export async function setupPATAuth');
    expect(errorFlowSpec).toContain('seedConnectedGitHubApp(context, extensionId');
    expect(errorFlowSpec).not.toContain("authenticationMethod: 'pat'");
    expect(errorFlowSpec).not.toContain('ghp_e2e_product_token');
    expect(errorFlowSpec).toContain("context.route('https://api.github.com/users/testuser'");
    expect(errorFlowSpec).toContain('chrome.tabs.update(boltTab.id, { active: true })');
  });

  it('migration helper seeds legacy PAT only for the explicit upgrade scenario', () => {
    const migrationOverrides: LegacyPatE2ESettings = {
      token: 'migration-only',
      repoOwner: 'preserved-owner',
      projectSettings: {
        preservedProject: { repoName: 'preserved-repo', branch: 'dev' },
      },
    };
    const storageHelper = readFileSync(join(process.cwd(), 'e2e/helpers/storage.ts'), 'utf8');
    const authSpec = readFileSync(join(process.cwd(), 'e2e/auth.spec.ts'), 'utf8');
    const nonMigrationSpecs = [
      'e2e/auto-push.spec.ts',
      'e2e/error-flow-product.spec.ts',
      'e2e/lifecycle.spec.ts',
      'e2e/manual-repo.spec.ts',
    ].map((path) => readFileSync(join(process.cwd(), path), 'utf8'));

    expect(seedLegacyPatMigration).toBeTypeOf('function');
    expect(migrationOverrides.token).toBe('migration-only');
    expect(migrationOverrides.repoOwner).toBe('preserved-owner');
    expect(migrationOverrides.projectSettings?.preservedProject).toMatchObject({
      repoName: 'preserved-repo',
      branch: 'dev',
    });
    expect(storageHelper).toContain('export async function seedLegacyPatMigration');
    expect(storageHelper).toContain("authenticationMethod: 'pat'");
    expect(storageHelper).toContain('githubToken');
    expect(authSpec).toContain('seedLegacyPatMigration(context, extensionId');
    expect(authSpec).toContain('Personal access token support has ended');
    expect(authSpec).toContain('githubAppMigrationRequired');
    expect(authSpec).toContain('projectSettings');
    expect(authSpec).not.toContain('setupPATAuth');
    expect(authSpec.match(/await seedLegacyPatMigration\(/g)).toHaveLength(1);
    expect(nonMigrationSpecs.some((source) => source.includes('seedLegacyPatMigration'))).toBe(
      false
    );
  });

  it('pins GitHub App-only onboarding validation to the current submit control', () => {
    const authSpec = readFileSync(join(process.cwd(), 'e2e/auth.spec.ts'), 'utf8');

    expect(authSpec).toContain("getByRole('button', { name: /sign in to bolt2github/i })");
    expect(authSpec).toContain('locator(\'input[type="password"]\')');
    expect(authSpec).toContain('toHaveCount(0)');
    expect(authSpec).not.toContain('fillOnboardingPAT');
  });

  it('seeds product error flows through a live GitHub App connection', () => {
    const productSpec = readFileSync(join(process.cwd(), 'e2e/error-flow-product.spec.ts'), 'utf8');

    expect(productSpec).toContain('seedConnectedGitHubApp(context, extensionId');
    expect(productSpec).not.toContain("authenticationMethod: 'pat'");
    expect(productSpec).not.toContain('githubToken');
  });

  it('repository browser specs target project-scoped settings instead of global Settings', () => {
    const manualRepoSpec = readFileSync(join(process.cwd(), 'e2e/manual-repo.spec.ts'), 'utf8');
    const productSpec = readFileSync(join(process.cwd(), 'e2e/error-flow-product.spec.ts'), 'utf8');

    expect(manualRepoSpec).toContain('openProjectRepositorySettings(page');
    expect(productSpec).toContain('openProjectRepositorySettings(page');
    expect(manualRepoSpec).not.toContain("navigateToTab(page, 'Settings')");
    expect(productSpec).not.toContain("navigateToTab(page, 'Settings')");
  });

  it('pins lifecycle E2E to current storage keys and popup URL', () => {
    const lifecycleSpec = readFileSync(join(process.cwd(), 'e2e/lifecycle.spec.ts'), 'utf8');

    expect(lifecycleSpec).toContain('settings.githubAppInstallationId');
    expect(lifecycleSpec).toContain('githubAppMigrationRequired');
    expect(lifecycleSpec).not.toContain('settings.authenticationMethod');
    expect(lifecycleSpec).not.toContain('setupPATAuth');
  });

  it('keeps only the deterministic product-visible error-flow suite', () => {
    const legacySpecPath = join(process.cwd(), 'e2e/errors.spec.ts');
    const productSpec = readFileSync(join(process.cwd(), 'e2e/error-flow-product.spec.ts'), 'utf8');

    expect(existsSync(legacySpecPath)).toBe(false);
    expect(productSpec).toContain("test('should show error for invalid repository name'");
    expect(productSpec).toContain("test('should show error when push fails'");
    expect(productSpec).toContain("test('should allow retry after failed push'");
  });

  it('fills only visible repository settings controls', async () => {
    const repoInput = createLocator();
    const branchInput = createLocator({ visible: true });
    const visibilityInput = createLocator({ visible: true });
    const keyboardPress = vi.fn().mockResolvedValue(undefined);
    const selectors: string[] = [];

    const page = {
      locator: vi.fn((selector: string) => {
        selectors.push(selector);
        if (selector.includes('branch')) {
          return branchInput;
        }
        if (selector.includes('radio')) {
          return visibilityInput;
        }
        return repoInput;
      }),
      keyboard: {
        press: keyboardPress,
      },
    } as unknown as Page;

    await fillRepositorySettings(page, {
      repoName: 'codefrost.bolt-to-github',
      branch: 'dev',
      visibility: 'private',
    });

    expect(selectors).toEqual([
      'input[placeholder*="repository" i]:visible, input[name*="repo" i]:visible, #repoName:visible',
      'input[placeholder*="branch" i]:visible, input[name*="branch" i]:visible, #branch:visible',
      'input[type="radio"][value="private"]:visible',
    ]);
    expect(repoInput.clear).toHaveBeenCalledTimes(1);
    expect(repoInput.pressSequentially).toHaveBeenCalledWith('codefrost.bolt-to-github');
    expect(keyboardPress).toHaveBeenCalledWith('Tab');
    expect(branchInput.fill).toHaveBeenCalledWith('dev');
    expect(visibilityInput.click).toHaveBeenCalledTimes(1);
  });

  it('opens project repository settings through the Projects route', async () => {
    const projectsTab = createLocator();
    const projectCard = createLocator();
    const settingsAction = createLocator();
    const modalHeading = createLocator();
    projectCard.getByRole.mockReturnValue(settingsAction);

    const page = {
      locator: vi.fn(() => projectsTab),
      getByRole: vi.fn((role: string) => {
        if (role === 'heading') return modalHeading;
        return projectCard;
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await openProjectRepositorySettings(page, 'mapped-repository');

    expect(projectsTab.click).toHaveBeenCalledOnce();
    expect(projectCard.hover).toHaveBeenCalledOnce();
    expect(projectCard.getByRole).toHaveBeenCalledWith('button', {
      name: /repository settings/i,
    });
    expect(settingsAction.click).toHaveBeenCalledOnce();
    expect(modalHeading.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 });
  });

  it('clicks the visible push button and confirmation after the hook', async () => {
    const pushButton = createLocator();
    const confirmButton = createLocator({ visible: true });
    const beforeClick = vi.fn().mockResolvedValue(undefined);
    const page = {
      locator: vi.fn(() => pushButton),
      context: vi.fn(() => ({
        pages: () => [
          {
            getByRole: vi.fn(() => confirmButton),
          },
        ],
      })),
    } as unknown as Page;

    await clickPushButton(page, beforeClick);

    expect(pushButton.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 });
    expect(beforeClick.mock.invocationCallOrder[0]).toBeLessThan(
      pushButton.click.mock.invocationCallOrder[0]
    );
    expect(pushButton.click).toHaveBeenCalledTimes(1);
    expect(confirmButton.click).toHaveBeenCalledTimes(1);
  });

  it('reads visible validation errors from alert surfaces', async () => {
    const errorMessage = createLocator({
      visible: true,
      text: 'Invalid repository name',
    });
    const page = {
      locator: vi.fn(() => errorMessage),
    } as unknown as Page;

    await expect(getValidationError(page)).resolves.toBe('Invalid repository name');
  });

  it('waits for visible error notifications', async () => {
    const errorMessage = createLocator({
      text: 'No active Bolt tab found',
    });
    const page = {
      locator: vi.fn(() => errorMessage),
    } as unknown as Page;

    await expect(waitForErrorNotification(page)).resolves.toBe('No active Bolt tab found');
    expect(errorMessage.filter).toHaveBeenCalledWith({
      hasText: /Error|Failed|Invalid|No active Bolt tab|content script|no content/i,
    });
    expect(errorMessage.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 10000 });
  });

  it('exports the extension Playwright fixture', () => {
    expect(extensionTest).toMatchObject({
      __fixtures: expect.objectContaining({
        context: expect.any(Function),
        extensionId: expect.any(Function),
      }),
    });
  });
});
