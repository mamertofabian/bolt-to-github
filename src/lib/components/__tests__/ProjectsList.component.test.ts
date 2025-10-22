/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ProjectsList from '../ProjectsList.svelte';

vi.mock('../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(() => ({
    listRepos: vi.fn().mockResolvedValue([]),
    getCommitCount: vi.fn().mockResolvedValue(0),
    getRepoInfo: vi.fn().mockResolvedValue({ exists: true, private: false }),
    request: vi.fn().mockResolvedValue([]),
  })),
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
      callback({ projectSettings: {} });
      return () => {};
    }),
    update: vi.fn(),
  },
}));

beforeEach(() => {
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
    githubToken: 'test-token',
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
});
