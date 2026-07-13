import type { AuthState } from '../../content/services/SupabaseAuthService';
import { BackgroundAuthClient } from '../services/BackgroundAuthClient';

export type GitHubConnectionFailureReason =
  | 'migration_required'
  | 'not_authenticated'
  | 'not_connected'
  | 'unavailable';

export interface GitHubConnectionResult {
  connected: boolean;
  reason?: GitHubConnectionFailureReason;
  message: string;
}

export interface GitHubConnectionAuthClient {
  getAuthState: () => Promise<AuthState>;
  syncGitHubApp: () => Promise<boolean>;
}

const CONNECTED_MESSAGE = 'GitHub is connected.';
const MIGRATION_REQUIRED_MESSAGE =
  'GitHub authentication has changed. Sign in to bolt2github.com and connect the GitHub App to continue.';
const MIGRATION_REQUIRED_KEY = 'githubAppMigrationRequired';
const SIGN_IN_MESSAGE = 'Sign in to bolt2github.com before using GitHub features.';
const CONNECT_MESSAGE = 'Connect GitHub at bolt2github.com before using GitHub features.';
const POPUP_VERIFICATION_CACHE_KEY = 'githubConnectionPopupVerification';
const POPUP_VERIFICATION_TTL_MS = 60_000;

interface PopupVerificationCacheRecord {
  userId: string;
  installationId: number;
  tokenExpiresAt: string;
  verifiedAt: number;
}

export async function checkGitHubConnection(
  authClient?: GitHubConnectionAuthClient
): Promise<GitHubConnectionResult> {
  return resolveGitHubConnection(authClient, false);
}

export async function checkPopupGitHubConnection(
  authClient?: GitHubConnectionAuthClient
): Promise<GitHubConnectionResult> {
  return resolveGitHubConnection(authClient, true);
}

async function resolveGitHubConnection(
  authClient: GitHubConnectionAuthClient | undefined,
  allowPopupCache: boolean
): Promise<GitHubConnectionResult> {
  try {
    const localSettings = await chrome.storage.local.get([
      MIGRATION_REQUIRED_KEY,
      'githubAppInstallationId',
      'githubAppExpiresAt',
      POPUP_VERIFICATION_CACHE_KEY,
    ]);

    const migrationRequired = localSettings[MIGRATION_REQUIRED_KEY] === true;

    const connectionAuthClient = authClient ?? new BackgroundAuthClient();
    const authState = await connectionAuthClient.getAuthState();
    if (!authState.isAuthenticated) {
      await clearPopupVerificationCache();
      if (migrationRequired) return migrationRequiredResult();
      return {
        connected: false,
        reason: 'not_authenticated',
        message: SIGN_IN_MESSAGE,
      };
    }

    const userId = authState.user?.id;
    if (
      allowPopupCache &&
      !migrationRequired &&
      userId &&
      isReusablePopupVerification(
        localSettings[POPUP_VERIFICATION_CACHE_KEY],
        userId,
        localSettings.githubAppInstallationId,
        localSettings.githubAppExpiresAt,
        Date.now()
      )
    ) {
      return { connected: true, message: CONNECTED_MESSAGE };
    }

    const hasGitHubApp = await connectionAuthClient.syncGitHubApp();
    if (!hasGitHubApp) {
      await clearPopupVerificationCache();
      if (migrationRequired) return migrationRequiredResult();
      return {
        connected: false,
        reason: 'not_connected',
        message: CONNECT_MESSAGE,
      };
    }

    if (migrationRequired) {
      await chrome.storage.local.remove(MIGRATION_REQUIRED_KEY);
    }
    await recordPopupVerification(userId);
    return { connected: true, message: CONNECTED_MESSAGE };
  } catch (error) {
    await clearPopupVerificationCache();
    return {
      connected: false,
      reason: 'unavailable',
      message: `Unable to verify the GitHub connection: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    };
  }
}

function migrationRequiredResult(): GitHubConnectionResult {
  return {
    connected: false,
    reason: 'migration_required',
    message: MIGRATION_REQUIRED_MESSAGE,
  };
}

function isReusablePopupVerification(
  value: unknown,
  userId: string,
  installationId: unknown,
  tokenExpiresAt: unknown,
  now: number
): value is PopupVerificationCacheRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<PopupVerificationCacheRecord>;
  const expiry = typeof tokenExpiresAt === 'string' ? Date.parse(tokenExpiresAt) : Number.NaN;
  return (
    record.userId === userId &&
    typeof installationId === 'number' &&
    Number.isFinite(installationId) &&
    installationId > 0 &&
    record.installationId === installationId &&
    record.tokenExpiresAt === tokenExpiresAt &&
    typeof record.verifiedAt === 'number' &&
    record.verifiedAt <= now &&
    now - record.verifiedAt < POPUP_VERIFICATION_TTL_MS &&
    Number.isFinite(expiry) &&
    expiry > now + POPUP_VERIFICATION_TTL_MS
  );
}

async function recordPopupVerification(userId: string | undefined): Promise<void> {
  if (!userId) {
    await clearPopupVerificationCache();
    return;
  }

  try {
    const settings = await chrome.storage.local.get([
      'githubAppInstallationId',
      'githubAppExpiresAt',
    ]);
    const installationId = settings.githubAppInstallationId;
    const tokenExpiresAt = settings.githubAppExpiresAt;
    const now = Date.now();
    const expiry = typeof tokenExpiresAt === 'string' ? Date.parse(tokenExpiresAt) : Number.NaN;

    if (
      typeof installationId !== 'number' ||
      !Number.isFinite(installationId) ||
      installationId <= 0 ||
      typeof tokenExpiresAt !== 'string' ||
      !Number.isFinite(expiry) ||
      expiry <= now + POPUP_VERIFICATION_TTL_MS
    ) {
      await clearPopupVerificationCache();
      return;
    }

    await chrome.storage.local.set({
      [POPUP_VERIFICATION_CACHE_KEY]: {
        userId,
        installationId,
        tokenExpiresAt,
        verifiedAt: now,
      } satisfies PopupVerificationCacheRecord,
    });
  } catch {
    // Cache persistence is an optimization and must not hide a successful live check.
  }
}

async function clearPopupVerificationCache(): Promise<void> {
  try {
    await chrome.storage.local.remove(POPUP_VERIFICATION_CACHE_KEY);
  } catch {
    // Cache cleanup is best effort; identity and expiry guards prevent stale reuse.
  }
}
