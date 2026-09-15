/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiClient } from '../../../services/GitHubApiClient';
import { GitHubAppAuthenticationStrategy } from '../../../services/GitHubAppAuthenticationStrategy';
import GitHubSettings from '../GitHubSettings.svelte';

const mockGetGitHubAppToken = vi.hoisted(() => vi.fn());
const mockGitHubRequest = vi.hoisted(() => vi.fn());

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

vi.mock('$lib/constants', () => ({
  GITHUB_APP_AUTH_URL: 'https://bolt2github.com/github/auth',
}));

describe('GitHubSettings connection-only contract', () => {
  // Removed repository props remain in this fixture during the red phase so
  // the legacy component can render far enough to expose its duplicate UI.
  const connectionProps = {
    repoOwner: 'octocat',
    repoName: 'bolt-project',
    branch: 'main',
    status: '',
    onSave: vi.fn(),
    onInput: vi.fn(),
    onError: null,
    projectId: 'project-1',
    buttonDisabled: false,
    githubAppInstallationId: 123,
    githubAppUsername: 'octocat',
    githubAppAvatarUrl: null,
    migrationRequired: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(GitHubAppAuthenticationStrategy.prototype, 'getToken').mockImplementation(
      mockGetGitHubAppToken
    );
    vi.spyOn(GitHubApiClient.prototype, 'request').mockImplementation(mockGitHubRequest);
    mockGetGitHubAppToken.mockResolvedValue('github-app-installation-token');
    mockGitHubRequest.mockResolvedValue([]);
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ githubAppMigrationRequired: false }),
        },
      },
    } as unknown as typeof chrome;
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('connected settings show GitHub App identity without project repository controls', () => {
    const { container } = render(GitHubSettings, { props: connectionProps });

    expect(screen.getByText(/connected as octocat/i)).toBeInTheDocument();
    expect(screen.getByText(/repository access is managed by the github app/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/repository owner/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/repository name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^branch/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
    expect(container.querySelector('input')).not.toBeInTheDocument();
  });

  it('connected settings always identify project-scoped repository configuration', () => {
    render(GitHubSettings, { props: connectionProps });

    expect(screen.getByRole('heading', { name: /github connection/i })).toBeInTheDocument();
    expect(
      screen.getByText(/repository mappings are configured per project from home or projects/i)
    ).toBeInTheDocument();
  });

  it('settings contain no PAT selector token field or token validation action', () => {
    const { container } = render(GitHubSettings, { props: connectionProps });

    expect(screen.queryByText(/personal access token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument();
  });

  it('disconnected settings offer an explicit GitHub App connection without project repository controls', async () => {
    render(GitHubSettings, {
      props: { ...connectionProps, githubAppInstallationId: null },
    });

    const connectButton = screen.getByRole('button', { name: /connect github app/i });
    expect(connectButton).toBeInTheDocument();
    expect(screen.queryByLabelText(/repository owner/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/repository name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^branch/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/repository mappings are configured per project from home or projects/i)
    ).toBeInTheDocument();

    await fireEvent.click(connectButton);

    expect(window.open).toHaveBeenCalledWith('https://bolt2github.com/github/auth', '_blank');
  });

  it('migration guidance directs repository changes to project surfaces without restoring the duplicate editor', () => {
    render(GitHubSettings, {
      props: {
        ...connectionProps,
        githubAppInstallationId: null,
        migrationRequired: true,
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/github app is now required/i);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /manage repository and branch settings from home or projects/i
    );
    expect(screen.queryByLabelText(/repository name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
  });

  it('rendering connection settings performs no repository discovery request', async () => {
    render(GitHubSettings, { props: connectionProps });

    await Promise.resolve();

    expect(mockGetGitHubAppToken).not.toHaveBeenCalled();
    expect(mockGitHubRequest).not.toHaveBeenCalled();
  });
});
