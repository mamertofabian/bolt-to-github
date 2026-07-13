import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const sourceExtensions = new Set(['.js', '.svelte', '.ts']);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(join(repositoryRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const repositoryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(repositoryPath);
    }

    return sourceExtensions.has(extname(entry.name)) ? [repositoryPath] : [];
  });
}

function matchesByFile(files: string[], pattern: RegExp): string[] {
  return files.flatMap((file) => {
    const contents = readFileSync(join(repositoryRoot, file), 'utf8');
    return pattern.test(contents) ? [relative(repositoryRoot, join(repositoryRoot, file))] : [];
  });
}

const productionSource = collectSourceFiles('src').filter(
  (file) =>
    !file.includes('/__tests__/') &&
    !file.includes('/__mocks__/') &&
    !file.includes('/test-fixtures/') &&
    !file.startsWith('src/test/') &&
    !/\.(?:spec|test)\.[jt]s$/.test(file)
);

const currentDocumentation = ['CLAUDE.md', 'GITHUB_TOKEN_RENEWAL_FIX.md', 'README.md'];

const migrationRuntimeAllowlist = new Set([
  'src/background/UsageTracker.ts',
  'src/lib/components/OnboardingSetup.svelte',
  'src/lib/constants/whatsNewContent.ts',
  'src/lib/services/githubAuthMigration.ts',
]);

const legacyCompatibilityAllowlist = new Set([
  ...migrationRuntimeAllowlist,
  'e2e/auth.spec.ts',
  'e2e/helpers/popup.ts',
  'e2e/helpers/storage.ts',
  'e2e/lifecycle.spec.ts',
  'e2e/manual-repo.spec.ts',
  'src/background/__tests__/BackgroundService.auth-lifecycle.test.ts',
  'src/background/__tests__/BackgroundService.critical-scenarios.test.ts',
  'src/background/__tests__/BackgroundService.edge-cases.test.ts',
  'src/background/__tests__/BackgroundService.storage-recovery.test.ts',
  'src/background/__tests__/UsageTracker.test.ts',
  'src/background/test-fixtures/BackgroundServiceTestFixtures.ts',
  'src/background/test-fixtures/BackgroundServiceTestHelpers.ts',
  'src/content/handlers/__tests__/FileChangeHandler.test.ts',
  'src/content/handlers/__tests__/GitHubUploadHandler.test.ts',
  'src/content/services/__tests__/SupabaseAuthService.edge-function-loop.test.ts',
  'src/content/services/__tests__/SupabaseAuthService.github-connection.test.ts',
  'src/content/services/__tests__/SupabaseAuthService.session-cleanup.test.ts',
  'src/lib/components/__tests__/GitHubSettings.component.test.ts',
  'src/lib/components/__tests__/GitHubSettings.logic.test.ts',
  'src/lib/components/__tests__/Help.component.test.ts',
  'src/lib/components/__tests__/IssueManager.component.test.ts',
  'src/lib/components/__tests__/OnboardingSetup.component.test.ts',
  'src/lib/components/__tests__/ProjectStatus.component.test.ts',
  'src/lib/components/__tests__/ProjectsList.component.test.ts',
  'src/lib/components/__tests__/QuickIssueForm.component.test.ts',
  'src/lib/components/__tests__/RepoSettings.component.test.ts',
  'src/lib/components/__tests__/RepoSettings.logic.test.ts',
  'src/lib/constants/__tests__/whatsNewContent.test.ts',
  'src/lib/services/__tests__/chromeStorage.RaceConditions.test.ts',
  'src/lib/services/__tests__/chromeStorage.test.ts',
  'src/lib/services/__tests__/githubAuthMigration.test.ts',
  'src/lib/stores/__tests__/githubSettings.test.ts',
  'src/lib/utils/__tests__/githubAppSync.test.ts',
  'src/lib/utils/__tests__/githubConnection.test.ts',
  'src/popup/__tests__/App.component.test.ts',
  'src/popup/__tests__/App.issue-feedback-auth-boundary.test.ts',
  'src/popup/__tests__/App.svelte/App.initialization.component.test.ts',
  'src/popup/__tests__/App.svelte/App.settings.component.test.ts',
  'src/popup/__tests__/App.svelte/App.user-interactions.component.test.ts',
  'src/popup/__tests__/__mocks__/FeedbackModal.svelte',
  'src/popup/__tests__/__mocks__/IssueManager.svelte',
  'src/popup/components/__tests__/FeedbackModal.component.test.ts',
  'src/popup/components/__tests__/HomeTabContent.component.test.ts',
  'src/popup/components/__tests__/SettingsTabContent.component.test.ts',
  'src/popup/components/__tests__/TabsView.component.test.ts',
  'src/services/__tests__/UnifiedGitHubService.auth-selection.test.ts',
  'src/services/__tests__/UnifiedGitHubService.focused.test.ts',
  'src/services/__tests__/ZipHandler.test.ts',
  'src/services/__tests__/authentication.types.test.ts',
  'src/services/__tests__/settings.test.ts',
  'src/services/__tests__/test-fixtures/unified/errors/ErrorFixtures.ts',
  'src/test/auth/githubAppOnlySourceGuard.test.ts',
  'src/test/e2e-helpers/popup-helpers.test.ts',
]);

const explicitLegacyFixtureAllowlist = new Set([
  'e2e/helpers/storage.ts',
  'src/background/__tests__/BackgroundService.critical-scenarios.test.ts',
  'src/background/__tests__/BackgroundService.edge-cases.test.ts',
  'src/background/test-fixtures/BackgroundServiceTestFixtures.ts',
  'src/lib/services/__tests__/chromeStorage.RaceConditions.test.ts',
  'src/lib/services/__tests__/chromeStorage.test.ts',
  'src/lib/services/__tests__/githubAuthMigration.test.ts',
  'src/lib/stores/__tests__/githubSettings.test.ts',
  'src/lib/utils/__tests__/githubConnection.test.ts',
  'src/test/e2e-helpers/popup-helpers.test.ts',
]);

describe('GitHub App-only source guard', () => {
  it('production source exposes no PAT strategy selector token constructor creation link or setup guidance', () => {
    const removedExecutionSurface =
      /PATAuthenticationStrategy|createPATStrategy|IAuthenticationStrategyFactory|MockPATAuthenticationStrategy|\bTokenService\b|\bITokenService\b|setupPATAuth|fillOnboardingPAT|github\.com\/settings\/tokens/i;
    const legacyProductLanguage =
      /\bPAT\b|personal access token|githubToken|authenticationMethod|PAT_AUTH_ADOPTED|pat_auth_adopted|two authentication options|GitHub App Recommended/i;
    const actionableLegacyDocumentation =
      /generate a personal access token|enter your GitHub token|choose your authentication method|full support for both personal access tokens|alternative to personal access tokens|works with both GitHub App and PAT|verify your token has repo permissions|github\.com\/settings\/tokens/i;

    expect(matchesByFile(productionSource, removedExecutionSurface)).toEqual([]);
    expect(
      matchesByFile(productionSource, legacyProductLanguage).filter(
        (file) => !migrationRuntimeAllowlist.has(file)
      )
    ).toEqual([]);
    expect(matchesByFile(currentDocumentation, actionableLegacyDocumentation)).toEqual([]);
  });

  it('legacy PAT identifiers are confined to migration handling third-party error compatibility and negative assertions', () => {
    const legacyVocabulary =
      /githubToken|authenticationMethod|setupPATAuth|fillOnboardingPAT|\bPAT\b|personal access token/i;
    const patFixtureSetup =
      /authenticationMethod\s*:\s*['"]pat['"]|githubToken\s*:\s*['"][^'"]+['"]/i;
    const testSources = [...collectSourceFiles('src'), ...collectSourceFiles('e2e')];
    const legacyReferences = matchesByFile(testSources, legacyVocabulary);
    const legacyFixtureSetups = matchesByFile(testSources, patFixtureSetup);

    expect(legacyReferences.filter((file) => !legacyCompatibilityAllowlist.has(file))).toEqual([]);
    expect(legacyFixtureSetups.filter((file) => !explicitLegacyFixtureAllowlist.has(file))).toEqual(
      []
    );
  });
});
