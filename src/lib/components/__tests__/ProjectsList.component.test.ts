/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ProjectsList from '../ProjectsList.svelte';
import projectsListSource from '../ProjectsList.svelte?raw';

const mockServiceConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({
    listRepos: vi.fn().mockResolvedValue([]),
    getCommitCount: vi.fn().mockResolvedValue(0),
    getRepoInfo: vi.fn().mockResolvedValue({ exists: true, private: false }),
    request: vi.fn().mockResolvedValue([]),
  }))
);
const mockCreateConnectedGitHubAppService = vi.hoisted(() => vi.fn());
const mockGitHubSettingsState = vi.hoisted(() => ({
  projectSettings: {} as Record<
    string,
    { repoName: string; branch: string; projectTitle?: string }
  >,
}));

vi.mock('../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: mockServiceConstructor,
}));

vi.mock('$lib/utils/connectedGitHubAppService', () => ({
  createConnectedGitHubAppService: mockCreateConnectedGitHubAppService,
}));

vi.mock('../../services/GitHubCacheService', () => ({
  GitHubCacheService: {
    getCachedRepos: vi.fn().mockResolvedValue([]),
    cacheRepos: vi.fn().mockResolvedValue(undefined),
    createEnhancedRepo: vi.fn().mockReturnValue({}),
    getRepoMetadata: vi.fn().mockResolvedValue(null),
    isRepoMetadataStale: vi.fn().mockResolvedValue(false),
    cacheRepoMetadata: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/chromeStorage', () => ({
  ChromeStorageService: {
    updateProjectMetadata: vi.fn().mockResolvedValue(undefined),
    deleteProjectSettings: vi.fn().mockResolvedValue(undefined),
    getGitHubSettings: vi.fn().mockResolvedValue({ projectSettings: {} }),
  },
}));

vi.mock('$lib/stores', () => ({
  githubSettingsStore: {
    subscribe: vi.fn((callback) => {
      callback(mockGitHubSettingsState);
      return () => {};
    }),
    update: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGitHubSettingsState.projectSettings = {};
  mockCreateConnectedGitHubAppService.mockImplementation(async () =>
    mockServiceConstructor({ type: 'github_app' })
  );
  Object.defineProperty(window, 'chrome', {
    value: {
      tabs: {
        query: vi.fn().mockResolvedValue([{ url: 'https://bolt.new' }]),
      },
      runtime: {
        connect: vi.fn().mockReturnValue({
          onMessage: { addListener: vi.fn() },
          postMessage: vi.fn(),
        }),
      },
      storage: {
        local: {
          set: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue({}),
        },
      },
    },
    writable: true,
    configurable: true,
  });
});

describe('ProjectsList Component', () => {
  const defaultProps = {
    repoOwner: 'testuser',
    isBoltSite: true,
    currentlyLoadedProjectId: null,
  };

  it('renders search input with correct placeholder', () => {
    render(ProjectsList, { props: defaultProps });

    expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
  });

  it('renders show repos checkbox', () => {
    render(ProjectsList, { props: defaultProps });

    const checkbox = screen.getByRole('checkbox', { name: /show repos/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('renders refresh button when show repos is enabled', () => {
    render(ProjectsList, { props: defaultProps });

    const refreshButton = screen.getByRole('button', { name: /refresh repos/i });
    expect(refreshButton).toBeInTheDocument();
  });

  it('allows user to search for projects', async () => {
    const user = userEvent.setup();
    render(ProjectsList, { props: defaultProps });

    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'test-project');

    expect(searchInput).toHaveValue('test-project');
  });

  it('shows clear button when search has content', async () => {
    const user = userEvent.setup();
    render(ProjectsList, { props: defaultProps });

    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'test');

    const clearButton = screen.getByRole('button', { name: '' });
    expect(clearButton).toBeInTheDocument();
  });

  it('clears search when clear button is clicked', async () => {
    const user = userEvent.setup();
    render(ProjectsList, { props: defaultProps });

    const searchInput = screen.getByPlaceholderText('Search projects...');
    await user.type(searchInput, 'test');

    const clearButton = screen.getByRole('button', { name: '' });
    await user.click(clearButton);

    expect(searchInput).toHaveValue('');
  });

  it('toggles show repos checkbox', async () => {
    const user = userEvent.setup();
    render(ProjectsList, { props: defaultProps });

    const checkbox = screen.getByRole('checkbox', { name: /show repos/i });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('shows loading state for repositories', () => {
    render(ProjectsList, { props: defaultProps });

    expect(screen.getByText(/loading your github repositories/i)).toBeInTheDocument();
  });

  it('renders github repositories section when show repos is enabled', () => {
    render(ProjectsList, { props: defaultProps });

    expect(screen.getByRole('heading', { name: /github repositories/i })).toBeInTheDocument();
  });

  it('has proper accessibility attributes for search input', () => {
    render(ProjectsList, { props: defaultProps });

    const searchInput = screen.getByPlaceholderText('Search projects...');
    expect(searchInput).toHaveAttribute('type', 'text');
  });

  it('has proper accessibility attributes for checkbox', () => {
    render(ProjectsList, { props: defaultProps });

    const checkbox = screen.getByRole('checkbox', { name: /show repos/i });
    expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  it('has proper accessibility attributes for refresh button', () => {
    render(ProjectsList, { props: defaultProps });

    const refreshButton = screen.getByRole('button', { name: /refresh repos/i });
    expect(refreshButton).toHaveAttribute('title', 'Refresh Repos');
  });

  it('repository settings action opens the authoritative project modal', async () => {
    const user = userEvent.setup();
    mockGitHubSettingsState.projectSettings = {
      'mapped-project': {
        repoName: 'mapped-repository',
        branch: 'dev',
        projectTitle: 'Mapped Project',
      },
    };
    render(ProjectsList, { props: defaultProps });

    await user.click(screen.getByRole('button', { name: /repository settings/i }));

    expect(screen.getByRole('heading', { name: /repository settings/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/repository name/i)).toHaveValue('mapped-repository');
    expect(screen.getByLabelText(/^branch/i)).toHaveValue('dev');
  });

  it('project actions remain discoverable without pointer hover', () => {
    expect(projectsListSource).not.toContain('opacity-0 group-hover:opacity-100');
  });

  it('projects list performs GitHub work only through GitHub App readiness', async () => {
    render(ProjectsList, { props: defaultProps });

    await waitFor(() =>
      expect(mockServiceConstructor).toHaveBeenCalledWith({ type: 'github_app' })
    );
    expect(mockServiceConstructor).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('disconnected projects list never instructs users to check a PAT or GitHub token permissions', async () => {
    mockCreateConnectedGitHubAppService.mockRejectedValueOnce(
      new Error('Sign in to bolt2github.com and connect the GitHub App.')
    );
    render(ProjectsList, { props: defaultProps });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign in to bolt2github.com and connect the GitHub App.');
    expect(alert).not.toHaveTextContent(/PAT|token permissions/i);
  });

  it('refresh retries GitHub App readiness after a disconnected result', async () => {
    const user = userEvent.setup();
    mockCreateConnectedGitHubAppService.mockRejectedValueOnce(
      new Error('Sign in to bolt2github.com and connect the GitHub App.')
    );
    render(ProjectsList, { props: defaultProps });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /refresh repos/i }));

    await waitFor(() => expect(mockCreateConnectedGitHubAppService).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('refresh remains disabled while GitHub App readiness is pending', async () => {
    mockCreateConnectedGitHubAppService.mockImplementation(() => new Promise(() => {}));
    render(ProjectsList, { props: defaultProps });

    const refreshButton = screen.getByRole('button', { name: /refresh repos/i });
    expect(refreshButton).toBeDisabled();
    expect(mockCreateConnectedGitHubAppService).toHaveBeenCalledOnce();
  });
});
