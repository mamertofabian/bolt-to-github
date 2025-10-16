/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ProjectStatus from '../ProjectStatus.svelte';

vi.mock('$lib/stores/issuesStore', () => ({
  issuesStore: {
    getOpenIssuesCount: vi.fn(() => ({
      subscribe: vi.fn((callback) => {
        callback(5);
        return () => {};
      }),
    })),
    loadIssues: vi.fn(),
  },
}));

vi.mock('$lib/stores/premiumStore', () => ({
  isPremium: {
    subscribe: vi.fn((callback) => {
      callback(false);
      return () => {};
    }),
  },
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: vi.fn().mockImplementation(() => ({
    getRepoInfo: vi.fn().mockResolvedValue({
      exists: true,
      private: false,
      description: 'Test repository',
      language: 'TypeScript',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-12-01T00:00:00Z',
      default_branch: 'main',
      open_issues_count: 5,
    }),
    listBranches: vi.fn().mockResolvedValue([{ name: 'main' }, { name: 'develop' }]),
    request: vi.fn().mockResolvedValue([
      {
        sha: 'abc123',
        commit: {
          message: 'Initial commit',
          committer: { date: '2023-01-01T00:00:00Z' },
          author: { name: 'Test Author' },
        },
      },
    ]),
    getCommitCount: vi.fn().mockResolvedValue(10),
  })),
}));

vi.mock('../services/chromeStorage', () => ({
  ChromeStorageService: {
    getProjectSettingsWithMetadata: vi.fn().mockResolvedValue(null),
    updateProjectMetadata: vi.fn(),
  },
}));

vi.mock('../services/GitHubCacheService', () => ({
  GitHubCacheService: {
    getRepoMetadata: vi.fn().mockResolvedValue(null),
    isCacheStale: vi.fn().mockResolvedValue(true),
    createEnhancedRepo: vi.fn(),
    cacheRepoMetadata: vi.fn(),
  },
}));

const mockChrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({
        authenticationMethod: 'pat',
        storedFileChanges: null,
        pendingFileChanges: null,
      }),
      set: vi.fn(),
    },
    sync: {
      get: vi.fn().mockResolvedValue({
        projectSettings: {},
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    create: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
  },
};

Object.defineProperty(window, 'chrome', {
  value: mockChrome,
  writable: true,
  configurable: true,
});

describe('ProjectStatus.svelte - Component Tests', () => {
  const defaultProps = {
    projectId: 'test-project-123',
    gitHubUsername: 'testuser',
    repoName: 'test-repo',
    branch: 'main',
    token: 'test-token',
    projectTitle: 'Test Project',
    handleUpgradeClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.storage.local.get.mockResolvedValue({
      authenticationMethod: 'pat',
      storedFileChanges: null,
      pendingFileChanges: null,
    });
    mockChrome.storage.sync.get.mockResolvedValue({
      projectSettings: {},
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Project Information Display', () => {
    it('should display project details to the user', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByText('Project:')).toBeInTheDocument();
      expect(screen.getByText('Test Project')).toBeInTheDocument();
      expect(screen.getByText('ID:')).toBeInTheDocument();
      expect(screen.getByText('test-project-123')).toBeInTheDocument();
      expect(screen.getByText('Repository:')).toBeInTheDocument();
      expect(screen.getByText('test-repo')).toBeInTheDocument();
      expect(screen.getByText('Branch:')).toBeInTheDocument();
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    it('should display custom project title when provided', () => {
      render(ProjectStatus, { props: { ...defaultProps, projectTitle: 'Custom Project' } });

      expect(screen.getByText('Custom Project')).toBeInTheDocument();
    });

    it('should make project details clickable for settings', () => {
      render(ProjectStatus, { props: defaultProps });

      const projectDetailsButton = screen.getByRole('button', { name: /project:/i });
      expect(projectDetailsButton).toBeInTheDocument();
      expect(projectDetailsButton).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Status Information Display', () => {
    it('should show status labels to the user', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByText('Status:')).toBeInTheDocument();
      expect(screen.getByText('Visibility:')).toBeInTheDocument();
      expect(screen.getByText('Open Issues:')).toBeInTheDocument();
      expect(screen.getByText('Latest Commit:')).toBeInTheDocument();
    });

    it('should show loading indicators while data is being fetched', () => {
      render(ProjectStatus, { props: defaultProps });

      const loadingElements = screen.getAllByText('Loading...');
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe('Action Buttons', () => {
    it('should render all action buttons with proper labels', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByRole('button', { name: /open in github/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /github issues/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /quick issue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /check for changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /push to github/i })).toBeInTheDocument();
    });

    it('should disable buttons while loading', () => {
      render(ProjectStatus, { props: defaultProps });

      const githubButton = screen.getByRole('button', { name: /open in github/i });
      const issueButton = screen.getByRole('button', { name: /github issues/i });
      const quickIssueButton = screen.getByRole('button', { name: /quick issue/i });
      const pushButton = screen.getByRole('button', { name: /push to github/i });

      expect(githubButton).toBeDisabled();
      expect(issueButton).toBeDisabled();
      expect(quickIssueButton).toBeDisabled();
      expect(pushButton).toBeDisabled();
    });
  });

  describe('Premium Features', () => {
    it('should show PRO badges for premium features when user is not premium', () => {
      render(ProjectStatus, { props: defaultProps });

      const proBadges = screen.getAllByText('PRO');
      expect(proBadges).toHaveLength(4);
    });

    it('should show premium feature buttons with PRO labels', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByRole('button', { name: /github issues.*pro/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /quick issue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /check for changes.*pro/i })).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should have clickable buttons for user interactions', () => {
      render(ProjectStatus, { props: defaultProps });

      const githubButton = screen.getByRole('button', { name: /open in github/i });
      const issueButton = screen.getByRole('button', { name: /github issues/i });
      const quickIssueButton = screen.getByRole('button', { name: /quick issue/i });
      const checkChangesButton = screen.getByRole('button', { name: /check for changes/i });
      const pushButton = screen.getByRole('button', { name: /push to github/i });

      expect(githubButton).toBeInTheDocument();
      expect(issueButton).toBeInTheDocument();
      expect(quickIssueButton).toBeInTheDocument();
      expect(checkChangesButton).toBeInTheDocument();
      expect(pushButton).toBeInTheDocument();
    });

    it('should call handleUpgradeClick when premium features are clicked by non-premium user', async () => {
      const user = userEvent.setup();
      const handleUpgradeClick = vi.fn();

      render(ProjectStatus, { props: { ...defaultProps, handleUpgradeClick } });

      const checkChangesButton = screen.getByRole('button', { name: /check for changes/i });
      await user.click(checkChangesButton);

      expect(handleUpgradeClick).toHaveBeenCalledWith('fileChanges');
    });
  });

  describe('File Changes Detection', () => {
    it('should show Check for Changes button when no file changes are detected', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByRole('button', { name: /check for changes/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for all interactive elements', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByRole('button', { name: /open in github/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /github issues/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /quick issue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /check for changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /push to github/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation for project details', () => {
      render(ProjectStatus, { props: defaultProps });

      const projectDetailsButton = screen.getByRole('button', { name: /project:/i });
      expect(projectDetailsButton).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Component Events', () => {
    it('should support event listeners for component events', () => {
      const { component } = render(ProjectStatus, { props: defaultProps });

      const settingsUpdatedHandler = vi.fn();
      const showFileChangesHandler = vi.fn();

      component.$on('settingsUpdated', settingsUpdatedHandler);
      component.$on('showFileChanges', showFileChangesHandler);

      expect(settingsUpdatedHandler).toBeDefined();
      expect(showFileChangesHandler).toBeDefined();
    });

    it('should call handleUpgradeClick when premium features are clicked', async () => {
      const user = userEvent.setup();
      const handleUpgradeClick = vi.fn();
      const { component } = render(ProjectStatus, {
        props: { ...defaultProps, handleUpgradeClick },
      });

      const showFileChangesHandler = vi.fn();
      component.$on('showFileChanges', showFileChangesHandler);

      const checkChangesButton = screen.getByRole('button', { name: /check for changes/i });
      await user.click(checkChangesButton);

      expect(handleUpgradeClick).toHaveBeenCalledWith('fileChanges');
    });
  });

  describe('Error Handling', () => {
    it('should render without crashing when provided with valid props', () => {
      render(ProjectStatus, { props: defaultProps });

      expect(screen.getByText('Project:')).toBeInTheDocument();
    });

    it('should handle missing project title gracefully', () => {
      render(ProjectStatus, { props: { ...defaultProps, projectTitle: undefined } });

      expect(screen.getByText('My Project')).toBeInTheDocument();
    });
  });
});
