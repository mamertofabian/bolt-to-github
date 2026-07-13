/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import {
  clearValidationState,
  filterRepositories,
  generateStatusDisplayText,
  generateStorageQuotaErrorMessage,
  hasRequiredSettings,
  isStorageQuotaError,
  repositoryExists,
  setDefaultRepoNameFromProjectId,
  shouldBeExpanded,
  shouldUpdateSettingsFromStorage,
  updateSettingsFromStorageChange,
  updateSettingsFromSyncStorage,
  validateGitHubApp,
  type GitHubSettingsState,
  type Repository,
} from '$lib/utils/github-settings';
import * as githubSettingsLogic from '$lib/utils/github-settings';

const connectedState: GitHubSettingsState = {
  githubAppInstallationId: 12345,
  githubAppUsername: 'octocat',
  repoOwner: 'octocat',
  repoName: 'bolt-repo',
  branch: 'main',
  isOnboarding: false,
  projectId: 'bolt-project',
};

const repositories: Repository[] = [
  {
    name: 'bolt-repo',
    description: 'Bolt project',
    html_url: 'https://github.com/octocat/bolt-repo',
    private: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-02',
    language: 'TypeScript',
  },
  {
    name: 'private-api',
    description: null,
    html_url: 'https://github.com/octocat/private-api',
    private: true,
    created_at: '2024-01-03',
    updated_at: '2024-01-04',
    language: null,
  },
];

describe('GitHubSettings Logic Functions', () => {
  it('GitHub settings helpers require installation metadata without PAT branches', () => {
    expect(hasRequiredSettings(connectedState)).toBe(true);
    expect(generateStatusDisplayText(connectedState)).toBe('Connected via GitHub App as octocat');
  });

  it('GitHub settings helpers export no PAT permission-check contract', () => {
    expect(githubSettingsLogic).not.toHaveProperty('needsPermissionCheck');
  });

  describe('hasRequiredSettings', () => {
    it('requires a GitHub App installation and repository owner', () => {
      expect(hasRequiredSettings({ ...connectedState, githubAppInstallationId: null })).toBe(false);
      expect(hasRequiredSettings({ ...connectedState, repoOwner: '' })).toBe(false);
    });

    it('does not require project name and branch during onboarding', () => {
      expect(
        hasRequiredSettings({ ...connectedState, isOnboarding: true, repoName: '', branch: '' })
      ).toBe(true);
    });

    it('requires project name and branch outside onboarding', () => {
      expect(hasRequiredSettings({ ...connectedState, repoName: '' })).toBe(false);
      expect(hasRequiredSettings({ ...connectedState, branch: '' })).toBe(false);
    });
  });

  it('expands incomplete or onboarding settings unless manually toggled', () => {
    expect(shouldBeExpanded(false, true, false, false)).toBe(false);
    expect(shouldBeExpanded(true, true, false, false)).toBe(true);
    expect(shouldBeExpanded(false, false, false, false)).toBe(true);
    expect(shouldBeExpanded(false, true, true, true)).toBe(true);
  });

  it('filters repositories by name or description and respects the limit', () => {
    expect(filterRepositories(repositories, 'bolt')).toEqual([repositories[0]]);
    expect(filterRepositories(repositories, 'project')).toEqual([repositories[0]]);
    expect(filterRepositories(repositories, '', 1)).toEqual([repositories[0]]);
  });

  it('detects repositories case-insensitively', () => {
    expect(repositoryExists(repositories, 'BOLT-REPO')).toBe(true);
    expect(repositoryExists(repositories, 'missing')).toBe(false);
    expect(repositoryExists(repositories, '')).toBe(false);
  });

  it('sets a default repository name only once', () => {
    expect(setDefaultRepoNameFromProjectId({ ...connectedState, repoName: '' })).toEqual(
      expect.objectContaining({ repoName: 'bolt-project', isRepoNameFromProjectId: true })
    );
    expect(setDefaultRepoNameFromProjectId(connectedState)).toEqual(connectedState);
  });

  it('shows an App connection prompt without installation metadata', () => {
    expect(generateStatusDisplayText({ ...connectedState, githubAppInstallationId: null })).toBe(
      'Connect with GitHub App to get started'
    );
    expect(generateStatusDisplayText({ ...connectedState, githubAppUsername: null })).toBe(
      'Connected via GitHub App as GitHub User'
    );
  });

  it('clears only the remaining GitHub App validation state', () => {
    expect(clearValidationState()).toEqual({
      isTokenValid: null,
      validationError: null,
      githubAppValidationResult: null,
      githubAppConnectionError: null,
    });
  });

  it('recognizes storage quota errors and provides recovery guidance', () => {
    expect(isStorageQuotaError(new Error('MAX_WRITE_OPERATIONS_PER_HOUR'))).toBe(true);
    expect(isStorageQuotaError('different error')).toBe(false);
    expect(generateStorageQuotaErrorMessage()).toContain('1800 times per hour');
  });

  it('updates settings only for the active project', () => {
    expect(
      shouldUpdateSettingsFromStorage(
        { projectId: 'bolt-project', repoName: 'repo', branch: 'main' },
        'bolt-project'
      )
    ).toBe(true);
    expect(
      shouldUpdateSettingsFromStorage(
        { projectId: 'other', repoName: 'repo', branch: 'main' },
        'bolt-project'
      )
    ).toBe(false);
  });

  it('validates GitHub App installation metadata', () => {
    expect(validateGitHubApp(12345, 'octocat', 'avatar')).toEqual({
      isValid: true,
      userInfo: { login: 'octocat', avatar_url: 'avatar' },
    });
    expect(validateGitHubApp(null)).toEqual({
      isValid: false,
      error: 'No GitHub App installation found',
    });
  });

  it('applies repository and branch storage changes', () => {
    expect(
      updateSettingsFromStorageChange(connectedState, { repoName: 'next-repo', branch: 'dev' })
    ).toEqual(expect.objectContaining({ repoName: 'next-repo', branch: 'dev' }));
  });

  it('loads the active project mapping from sync storage', () => {
    expect(
      updateSettingsFromSyncStorage(connectedState, {
        'bolt-project': { repoName: 'synced-repo', branch: 'feature' },
      })
    ).toEqual(expect.objectContaining({ repoName: 'synced-repo', branch: 'feature' }));
    expect(updateSettingsFromSyncStorage({ ...connectedState, projectId: null }, {})).toEqual({
      ...connectedState,
      projectId: null,
    });
  });

  it('does not depend on the system clock for App-only readiness', () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    expect(hasRequiredSettings(connectedState)).toBe(true);
    vi.useRealTimers();
  });
});
