/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubSettingsState } from '$lib/stores/githubSettings';
import SettingsTabContent from '../SettingsTabContent.svelte';

describe('SettingsTabContent GitHub App-only boundary', () => {
  const githubSettings: GitHubSettingsState = {
    repoOwner: 'octocat',
    repoName: 'bolt-project',
    branch: 'main',
    projectSettings: {},
    isValidatingToken: false,
    isTokenValid: true,
    validationError: null,
    hasInitialSettings: true,
    githubAppInstallationId: 123,
    githubAppUsername: 'octocat',
    githubAppAvatarUrl: null,
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

  it('settings tab keeps account and global preferences without project repository controls', () => {
    const { container } = render(SettingsTabContent, {
      props: {
        githubSettings,
        isUserPremium: false,
      },
    });

    expect(screen.getByText(/connected as octocat/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /push reminders/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /premium status/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /privacy & analytics/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/repository owner/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/repository name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^branch/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/personal access token/i)).not.toBeInTheDocument();
  });

  it('settings tab forwards GitHub App state without PAT bindings', () => {
    const { container } = render(SettingsTabContent, {
      props: { githubSettings, isUserPremium: false },
    });

    expect(screen.getByText(/connected as octocat/i)).toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/personal access token/i)).not.toBeInTheDocument();
  });
});
