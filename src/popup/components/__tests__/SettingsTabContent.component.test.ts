/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubSettingsState } from '$lib/stores/githubSettings';
import type { UIState } from '$lib/stores/uiState';
import SettingsTabContent from '../SettingsTabContent.svelte';

describe('SettingsTabContent GitHub App-only boundary', () => {
  const githubSettings: GitHubSettingsState = {
    githubToken: 'legacy-value-must-not-be-forwarded',
    repoOwner: 'octocat',
    repoName: 'bolt-project',
    branch: 'main',
    projectSettings: {},
    isValidatingToken: false,
    isTokenValid: true,
    validationError: null,
    hasInitialSettings: true,
    authenticationMethod: 'pat',
    githubAppInstallationId: 123,
    githubAppUsername: 'octocat',
    githubAppAvatarUrl: null,
  };

  const uiState: UIState = {
    activeTab: 'settings',
    status: '',
    hasStatus: false,
    showTempRepoModal: false,
    tempRepoData: null,
    hasDeletedTempRepo: false,
    hasUsedTempRepoName: false,
  };

  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ githubAppMigrationRequired: false }),
        },
      },
      tabs: { create: vi.fn() },
      runtime: {
        getURL: vi.fn().mockReturnValue('chrome-extension://test/src/pages/logs.html'),
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => cleanup());

  it('settings tab forwards GitHub App state without PAT bindings', () => {
    const { container } = render(SettingsTabContent, {
      props: {
        githubSettings,
        projectId: 'project-1',
        uiState,
        isUserPremium: false,
      },
    });

    expect(screen.getByText(/connected as octocat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repository owner/i)).toHaveValue('octocat');
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/personal access token/i)).not.toBeInTheDocument();
  });
});
