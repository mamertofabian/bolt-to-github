/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingSetup from '../OnboardingSetup.svelte';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

vi.mock('$lib/constants', () => ({
  GITHUB_APP_AUTH_URL: 'https://bolt2github.com/github/auth',
  TUTORIAL_LINK: 'https://example.com/obsolete-tutorial',
  CREATE_TOKEN_URL: 'https://github.com/settings/tokens/new',
}));

describe('OnboardingSetup GitHub App-only contract', () => {
  const uiState = { status: undefined, hasStatus: false };
  const disconnectedSettings = {
    githubAppInstallationId: undefined,
    githubAppUsername: undefined,
    githubAppAvatarUrl: undefined,
    repoOwner: 'preserved-owner',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('fresh setup offers only the GitHub App connection path', () => {
    render(OnboardingSetup, {
      props: {
        githubSettings: disconnectedSettings,
        uiState,
        isUserAuthenticated: true,
      },
    });

    expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect github app/i })).toBeInTheDocument();
    expect(screen.queryByText(/personal access token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('legacy PAT migration explains the required authentication change', () => {
    render(OnboardingSetup, {
      props: {
        githubSettings: disconnectedSettings,
        uiState,
        isUserAuthenticated: false,
        migrationRequired: true,
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/github authentication has changed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/github app is now required/i);
    expect(screen.getByRole('button', { name: /sign in to bolt2github/i })).toBeInTheDocument();
  });

  it('rendering migration state never opens an external tab', () => {
    render(OnboardingSetup, {
      props: {
        githubSettings: disconnectedSettings,
        uiState,
        isUserAuthenticated: false,
        migrationRequired: true,
      },
    });

    expect(window.open).not.toHaveBeenCalled();
  });

  it('setup completion requires live session and GitHub App installation', async () => {
    const user = userEvent.setup();
    let saveCount = 0;
    const { component } = render(OnboardingSetup, {
      props: {
        githubSettings: disconnectedSettings,
        uiState,
        isUserAuthenticated: true,
      },
    });
    component.$on('save', () => saveCount++);

    await user.click(screen.getByRole('button', { name: /connect github app/i }));
    expect(window.open).toHaveBeenCalledWith('https://bolt2github.com/github/auth', '_blank');
    expect(saveCount).toBe(0);

    cleanup();
    const connected = render(OnboardingSetup, {
      props: {
        githubSettings: {
          ...disconnectedSettings,
          githubAppInstallationId: 123,
          githubAppUsername: 'octocat',
        },
        uiState,
        isUserAuthenticated: true,
      },
    });
    connected.component.$on('save', () => saveCount++);

    await user.click(screen.getByRole('button', { name: /complete setup/i }));
    expect(saveCount).toBe(1);
  });

  it('setup contains no PAT creation link or obsolete tutorial CTA', () => {
    const { container } = render(OnboardingSetup, {
      props: {
        githubSettings: disconnectedSettings,
        uiState,
        isUserAuthenticated: true,
      },
    });

    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create token/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tutorial/i })).not.toBeInTheDocument();
  });

  it('should keep a stale GitHub App installation visibly blocked while signed out', () => {
    render(OnboardingSetup, {
      props: {
        githubSettings: {
          ...disconnectedSettings,
          githubAppInstallationId: 123,
          githubAppUsername: 'octocat',
        },
        uiState,
        isUserAuthenticated: false,
      },
    });

    expect(screen.getByText(/github app is installed/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to bolt2github to continue/i)).toBeInTheDocument();
    expect(screen.queryByText(/connected as octocat/i)).not.toBeInTheDocument();
  });

  it('should open Bolt2GitHub login without saving when the signed-out setup CTA is clicked', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const { component } = render(OnboardingSetup, {
      props: {
        githubSettings: {
          ...disconnectedSettings,
          githubAppInstallationId: 123,
        },
        uiState: {
          status: 'Sign in to bolt2github.com before using GitHub features.',
          hasStatus: true,
        },
        isUserAuthenticated: false,
      },
    });
    component.$on('save', save);

    await user.click(screen.getByRole('button', { name: /sign in to bolt2github/i }));

    expect(window.open).toHaveBeenCalledWith('https://bolt2github.com/login', '_blank');
    expect(save).not.toHaveBeenCalled();
  });
});
