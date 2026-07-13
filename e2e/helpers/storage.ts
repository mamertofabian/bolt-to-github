import type { BrowserContext, Worker } from '@playwright/test';

type ProjectSettings = Record<string, { repoName: string; branch: string; projectTitle?: string }>;

export interface GitHubAppE2ESettings {
  userId?: string;
  email?: string;
  installationId?: number;
  username?: string;
  avatarUrl?: string;
  repoOwner?: string;
  projectSettings?: ProjectSettings;
}

export interface LegacyPatE2ESettings {
  token?: string;
  repoOwner?: string;
  projectSettings?: ProjectSettings;
}

export interface GitHubAppStoredSettings {
  repoOwner?: string;
  projectSettings?: ProjectSettings;
  githubAppInstallationId?: number;
  githubAppUsername?: string;
  githubAppAvatarUrl?: string;
  githubAppExpiresAt?: string;
  githubAppMigrationRequired?: boolean;
  supabaseAuthState?: {
    isAuthenticated: boolean;
    user?: { id?: string; email?: string } | null;
  };
}

const DEFAULT_USER_ID = 'e2e-bolt2github-user';
const DEFAULT_USERNAME = 'testuser';
const DEFAULT_INSTALLATION_ID = 12345;
const DEFAULT_AVATAR_URL = 'https://avatars.githubusercontent.com/u/1234567';
const E2E_SESSION_TOKEN = 'e2e-supabase-session-token';
const E2E_GITHUB_APP_TOKEN = 'e2e-github-app-installation-token';

async function getExtensionWorker(context: BrowserContext, extensionId: string): Promise<Worker> {
  const existingWorker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(`chrome-extension://${extensionId}/`));

  if (existingWorker) return existingWorker;

  return context.waitForEvent('serviceworker', {
    predicate: (worker) => worker.url().startsWith(`chrome-extension://${extensionId}/`),
    timeout: 30_000,
  });
}

async function installConnectedApiRoutes(
  context: BrowserContext,
  settings: Required<
    Pick<GitHubAppE2ESettings, 'avatarUrl' | 'email' | 'installationId' | 'userId' | 'username'>
  >,
  expiresAt: string
): Promise<void> {
  await context.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: settings.userId,
        email: settings.email,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2026-07-13T00:00:00.000Z',
      }),
    });
  });

  await context.route('**/rest/v1/rpc/get_subscription_status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { subscription_status: 'inactive', plan_name: 'free', current_period_end: null },
      ]),
    });
  });

  await context.route('**/functions/v1/get-github-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'github_app',
        access_token: E2E_GITHUB_APP_TOKEN,
        installation_id: settings.installationId,
        github_username: settings.username,
        expires_at: expiresAt,
        scopes: ['contents:write'],
      }),
    });
  });

  await context.route('https://api.github.com/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1234567,
        login: settings.username,
        avatar_url: settings.avatarUrl,
      }),
    });
  });
}

async function forceBackgroundAuthCheck(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/src/pages/logs.html`);
  const response = await extensionPage.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'FORCE_AUTH_CHECK' })
  );
  await extensionPage.close();

  if (!response || response.success !== true) {
    throw new Error(
      `Unable to establish E2E Bolt2GitHub session: ${response?.error ?? 'no reply'}`
    );
  }
}

/**
 * Seed the same live connection authority used by the popup: a Bolt2GitHub
 * session, a GitHub App installation, and a short-lived verified-popup cache.
 */
export async function seedConnectedGitHubApp(
  context: BrowserContext,
  extensionId: string,
  settings: GitHubAppE2ESettings | undefined = undefined
): Promise<void> {
  const userId = settings?.userId ?? DEFAULT_USER_ID;
  const email = settings?.email ?? 'e2e@bolt2github.test';
  const installationId = settings?.installationId ?? DEFAULT_INSTALLATION_ID;
  const username = settings?.username ?? DEFAULT_USERNAME;
  const avatarUrl = settings?.avatarUrl ?? DEFAULT_AVATAR_URL;
  const repoOwner = settings?.repoOwner ?? username;
  const now = Date.now();
  const tokenExpiresAt = new Date(now + 60 * 60_000).toISOString();
  const worker = await getExtensionWorker(context, extensionId);
  const extensionVersion = await worker.evaluate(() => chrome.runtime.getManifest().version);

  await installConnectedApiRoutes(
    context,
    { avatarUrl, email, installationId, userId, username },
    tokenExpiresAt
  );

  await worker.evaluate(
    async ({ localSettings, syncSettings }) => {
      await Promise.all([
        chrome.storage.sync.set(syncSettings),
        chrome.storage.local.remove([
          'authenticationMethod',
          'preferredAuthMethod',
          'migrationPromptShown',
          'lastMigrationPrompt',
          'githubAppMigrationRequired',
        ]),
        chrome.storage.sync.remove('githubToken'),
        chrome.storage.local.set(localSettings),
      ]);
    },
    {
      syncSettings: {
        repoOwner,
        ...(settings?.projectSettings ? { projectSettings: settings.projectSettings } : {}),
      },
      localSettings: {
        supabaseToken: E2E_SESSION_TOKEN,
        supabaseTokenExpiry: now + 60 * 60_000,
        supabaseAuthState: {
          isAuthenticated: true,
          user: {
            id: userId,
            email,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2026-07-13T00:00:00.000Z',
          },
          subscription: { isActive: false, plan: 'free' },
        },
        extensionSessionMinted: true,
        extensionSessionMintedAt: now,
        githubAppInstallationId: installationId,
        githubAppUsername: username,
        githubAppAvatarUrl: avatarUrl,
        githubAppAccessToken: E2E_GITHUB_APP_TOKEN,
        githubAppExpiresAt: tokenExpiresAt,
        whatsNew: {
          lastShownVersion: extensionVersion,
          dismissedVersions: [extensionVersion],
          lastCheckTime: now,
        },
      },
    }
  );

  await forceBackgroundAuthCheck(context, extensionId);

  await worker.evaluate(
    async ({ installationId: connectedInstallationId, tokenExpiresAt: expiry, userId: id }) => {
      await chrome.storage.local.set({
        githubConnectionPopupVerification: {
          userId: id,
          installationId: connectedInstallationId,
          tokenExpiresAt: expiry,
          verifiedAt: Date.now(),
        },
      });
    },
    { installationId, tokenExpiresAt, userId }
  );
}

/**
 * Seed only the retired credential format. This helper exists exclusively for
 * the browser upgrade scenario that proves migration guidance and cleanup.
 */
export async function seedLegacyPatMigration(
  context: BrowserContext,
  extensionId: string,
  settings: LegacyPatE2ESettings | undefined = undefined
): Promise<void> {
  const worker = await getExtensionWorker(context, extensionId);

  await worker.evaluate(
    async ({ localSettings, syncSettings }) => {
      await Promise.all([
        chrome.storage.sync.set(syncSettings),
        chrome.storage.local.set(localSettings),
      ]);
    },
    {
      syncSettings: {
        githubToken: settings?.token ?? 'ghp_legacy_migration_fixture',
        repoOwner: settings?.repoOwner ?? DEFAULT_USERNAME,
        ...(settings?.projectSettings ? { projectSettings: settings.projectSettings } : {}),
      },
      localSettings: { authenticationMethod: 'pat' },
    }
  );
}

export async function getGitHubSettings(
  context: BrowserContext,
  extensionId: string
): Promise<GitHubAppStoredSettings> {
  const worker = await getExtensionWorker(context, extensionId);

  return worker.evaluate(async () => {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(['repoOwner', 'projectSettings']),
      chrome.storage.local.get([
        'githubAppInstallationId',
        'githubAppUsername',
        'githubAppAvatarUrl',
        'githubAppExpiresAt',
        'githubAppMigrationRequired',
        'supabaseAuthState',
      ]),
    ]);

    return { ...syncData, ...localData };
  });
}

export async function clearStorage(context: BrowserContext, extensionId: string): Promise<void> {
  const worker = await getExtensionWorker(context, extensionId);
  await worker.evaluate(async () => {
    await Promise.all([chrome.storage.sync.clear(), chrome.storage.local.clear()]);
  });
}
