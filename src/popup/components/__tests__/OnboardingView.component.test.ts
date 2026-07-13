/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitHubSettingsState, ProjectSettingsState, UIState } from '$lib/stores';
import OnboardingView from '../OnboardingView.svelte';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/WelcomeHero.svelte');
vi.unmock('$lib/components/OnboardingSetup.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

const githubSettings: GitHubSettingsState = {
  hasInitialSettings: false,
  githubToken: '',
  repoOwner: 'preserved-owner',
  repoName: 'preserved-repo',
  branch: 'main',
  projectSettings: {},
  isValidatingToken: false,
  isTokenValid: null,
  validationError: null,
  authenticationMethod: 'github_app',
  githubAppInstallationId: null,
  githubAppUsername: null,
  githubAppAvatarUrl: null,
};

const projectSettings: ProjectSettingsState = {
  version: '1.3.21',
  currentUrl: '',
  parsedProjectId: null,
  isBoltSite: true,
  projectTitle: '',
};

const uiState: UIState = {
  activeTab: 'home',
  status: '',
  hasStatus: false,
  showTempRepoModal: false,
  tempRepoData: null,
  hasDeletedTempRepo: false,
  hasUsedTempRepoName: false,
};

async function openSetup(props: Record<string, unknown> = {}) {
  const user = userEvent.setup();
  render(OnboardingView, {
    props: { githubSettings, projectSettings, uiState, ...props },
  });
  await user.click(screen.getByRole('button', { name: /connect github account/i }));
  return user;
}

describe('OnboardingView GitHub App-only forwarding', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('onboarding forwards the GitHub App migration-required state', async () => {
    await openSetup({ migrationRequired: true, isUserAuthenticated: false });

    expect(screen.getByRole('alert')).toHaveTextContent(/github authentication has changed/i);
    expect(screen.getByRole('button', { name: /sign in to bolt2github/i })).toBeInTheDocument();
  });

  it('should forward signed-out state to the GitHub App setup step', async () => {
    await openSetup({
      githubSettings: {
        ...githubSettings,
        githubAppInstallationId: 123,
        githubAppUsername: 'octocat',
      },
      isUserAuthenticated: false,
    });

    expect(screen.getByText(/github app is installed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to bolt2github/i })).toBeInTheDocument();
    expect(screen.queryByText(/connected as octocat/i)).not.toBeInTheDocument();
  });
});
