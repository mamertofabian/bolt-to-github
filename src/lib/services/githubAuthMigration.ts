export type GitHubAppMigrationStatus = 'not_required' | 'migration_required' | 'completed';

export interface LegacyGitHubAuthSnapshot {
  authenticationMethod?: 'pat' | 'github_app';
  githubToken?: string;
  githubAppInstallationId?: number;
  migrationRequired?: boolean;
  preferredAuthMethod?: 'pat' | 'github_app';
  migrationPromptShown?: boolean;
  lastMigrationPrompt?: string;
}

export interface GitHubAuthMigrationDecision {
  status: GitHubAppMigrationStatus;
  removeStoredPat: boolean;
  removeLegacyMethodKeys: boolean;
  persistMigrationRequired: boolean;
}

const MIGRATION_REQUIRED_KEY = 'githubAppMigrationRequired';
const LEGACY_LOCAL_AUTH_KEYS = [
  'authenticationMethod',
  'preferredAuthMethod',
  'migrationPromptShown',
  'lastMigrationPrompt',
];

export function resolveGitHubAuthMigration(
  snapshot: LegacyGitHubAuthSnapshot
): GitHubAuthMigrationDecision {
  const hasStoredPat =
    typeof snapshot.githubToken === 'string' && snapshot.githubToken.trim().length > 0;
  const hasStoredGitHubApp =
    snapshot.authenticationMethod === 'github_app' &&
    typeof snapshot.githubAppInstallationId === 'number' &&
    snapshot.githubAppInstallationId > 0;
  const hasLegacyMethodState =
    snapshot.authenticationMethod !== undefined ||
    snapshot.preferredAuthMethod !== undefined ||
    snapshot.migrationPromptShown !== undefined ||
    snapshot.lastMigrationPrompt !== undefined ||
    hasStoredPat;

  if (snapshot.migrationRequired) {
    return {
      status: 'migration_required',
      removeStoredPat: hasStoredPat,
      removeLegacyMethodKeys: hasLegacyMethodState,
      persistMigrationRequired: false,
    };
  }

  if (hasStoredGitHubApp) {
    return {
      status: 'completed',
      removeStoredPat: hasStoredPat,
      removeLegacyMethodKeys: hasLegacyMethodState,
      persistMigrationRequired: false,
    };
  }

  if (
    snapshot.authenticationMethod === 'pat' ||
    snapshot.preferredAuthMethod === 'pat' ||
    hasStoredPat
  ) {
    return {
      status: 'migration_required',
      removeStoredPat: hasStoredPat,
      removeLegacyMethodKeys: hasLegacyMethodState,
      persistMigrationRequired: true,
    };
  }

  return {
    status: 'not_required',
    removeStoredPat: false,
    removeLegacyMethodKeys: hasLegacyMethodState,
    persistMigrationRequired: false,
  };
}

export async function migrateLegacyGitHubAuthentication(): Promise<GitHubAuthMigrationDecision> {
  const [syncState, localState] = await Promise.all([
    chrome.storage.sync.get(['githubToken']),
    chrome.storage.local.get([
      'authenticationMethod',
      'githubAppInstallationId',
      MIGRATION_REQUIRED_KEY,
      'preferredAuthMethod',
      'migrationPromptShown',
      'lastMigrationPrompt',
    ]),
  ]);

  const decision = resolveGitHubAuthMigration({
    authenticationMethod: localState.authenticationMethod,
    githubToken: syncState.githubToken,
    githubAppInstallationId: localState.githubAppInstallationId,
    migrationRequired: localState[MIGRATION_REQUIRED_KEY],
    preferredAuthMethod: localState.preferredAuthMethod,
    migrationPromptShown: localState.migrationPromptShown,
    lastMigrationPrompt: localState.lastMigrationPrompt,
  });

  // Chrome storage namespaces cannot be mutated atomically. Persist the user-visible
  // reason first so a crash can never remove the credential without leaving guidance.
  if (decision.persistMigrationRequired) {
    await chrome.storage.local.set({ [MIGRATION_REQUIRED_KEY]: true });
  }

  if (decision.removeStoredPat) {
    await chrome.storage.sync.remove('githubToken');
  }

  if (decision.removeLegacyMethodKeys) {
    await chrome.storage.local.remove(LEGACY_LOCAL_AUTH_KEYS);
  }

  return decision;
}

export async function completeGitHubAppMigration(
  liveSessionConnected: boolean,
  installationConnected: boolean
): Promise<boolean> {
  if (!liveSessionConnected || !installationConnected) {
    return false;
  }

  await chrome.storage.local.remove(MIGRATION_REQUIRED_KEY);
  return true;
}
