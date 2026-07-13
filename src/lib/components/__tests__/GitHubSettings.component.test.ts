/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiClient } from '../../../services/GitHubApiClient';
import { GitHubAppAuthenticationStrategy } from '../../../services/GitHubAppAuthenticationStrategy';
import GitHubSettings from '../GitHubSettings.svelte';

const mockGetGitHubAppToken = vi.hoisted(() => vi.fn());
const mockGitHubRequest = vi.hoisted(() => vi.fn());

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/ui/input');
vi.unmock('$lib/components/ui/input/index.ts');
vi.unmock('$lib/components/ui/input/input.svelte');
vi.unmock('$lib/components/ui/label');
vi.unmock('$lib/components/ui/label/index.ts');
vi.unmock('$lib/components/ui/label/label.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

vi.mock('$lib/constants', () => ({
  GITHUB_APP_AUTH_URL: 'https://bolt2github.com/github/auth',
}));

describe('GitHubSettings GitHub App-only contract', () => {
  const defaultProps = {
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
    global.MutationObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
    }));
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

  it('settings contain no PAT selector token field or token validation action', () => {
    const { container } = render(GitHubSettings, { props: defaultProps });

    expect(screen.getByText(/connected as octocat/i)).toBeInTheDocument();
    expect(screen.queryByText(/personal access token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument();
  });

  it('existing repository settings remain visible during GitHub App migration', () => {
    render(GitHubSettings, {
      props: {
        ...defaultProps,
        githubAppInstallationId: null,
        migrationRequired: true,
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/github app is now required/i);
    expect(screen.getByLabelText(/repository owner/i)).toHaveValue('octocat');
    expect(screen.getByLabelText(/repository name/i)).toHaveValue('bolt-project');
    expect(screen.getByLabelText(/branch/i)).toHaveValue('main');
  });

  it('shows repository validation errors in GitHub settings', async () => {
    render(GitHubSettings, { props: defaultProps });

    const repoName = screen.getByLabelText(/repository name/i);
    await fireEvent.input(repoName, { target: { value: '-invalid--name' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/repository name/i);
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
  });

  it('clears GitHub settings repository validation errors after correction', async () => {
    render(GitHubSettings, { props: defaultProps });

    const repoName = screen.getByLabelText(/repository name/i);
    await fireEvent.input(repoName, { target: { value: '-invalid' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await fireEvent.input(repoName, { target: { value: 'valid-repository' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled();
  });

  it('updates visible repository drafts after switching projects', async () => {
    const { rerender } = render(GitHubSettings, { props: defaultProps });

    await rerender({
      ...defaultProps,
      projectId: 'project-2',
      repoName: 'second-project',
      branch: 'release',
    });

    expect(screen.getByLabelText(/repository name/i)).toHaveValue('second-project');
    expect(screen.getByLabelText(/branch/i)).toHaveValue('release');
  });

  it('settings preserve GitHub App repository discovery', async () => {
    mockGitHubRequest.mockResolvedValue([
      {
        name: 'existing-repository',
        description: 'Existing App-accessible repository',
        private: true,
      },
    ]);
    render(GitHubSettings, { props: defaultProps });

    await waitFor(() => expect(mockGetGitHubAppToken).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockGitHubRequest).toHaveBeenCalledOnce());
    await fireEvent.focus(screen.getByLabelText(/repository name/i));
    expect(await screen.findByText('existing-repository')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /existing-repository/i }));

    expect(mockGetGitHubAppToken).toHaveBeenCalledOnce();
    expect(mockGitHubRequest).toHaveBeenCalledWith('GET', '/user/repos?sort=updated&per_page=100');
    expect(screen.getByLabelText(/repository name/i)).toHaveValue('existing-repository');
  });

  it('repository discovery failure stays visible while manual entry remains available', async () => {
    mockGitHubRequest.mockRejectedValue(new Error('GitHub unavailable'));
    render(GitHubSettings, { props: defaultProps });

    await waitFor(() => expect(mockGetGitHubAppToken).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockGitHubRequest).toHaveBeenCalledOnce());
    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to load repositories/i);
    expect(screen.getByLabelText(/repository name/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: /retry repository list/i })).toBeInTheDocument();
  });
});
