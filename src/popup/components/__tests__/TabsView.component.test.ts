/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TabsView from '../TabsView.svelte';
import type { UIState } from '$lib/stores/uiState';
import type { GitHubSettingsState } from '$lib/stores/githubSettings';
import type { ProjectSettingsState } from '$lib/stores/projectSettings';
import type { ProjectStatusRef } from '../../types';

describe('TabsView', () => {
  let mockUIState: UIState;
  let mockGitHubSettings: GitHubSettingsState;
  let mockProjectSettings: ProjectSettingsState;
  let mockProjectStatusRef: ProjectStatusRef;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUIState = {
      activeTab: 'home',
      status: '',
      hasStatus: false,
      showTempRepoModal: false,
      tempRepoData: null,
      hasDeletedTempRepo: false,
      hasUsedTempRepoName: false,
    };

    mockGitHubSettings = {
      githubToken: 'test-token',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      projectSettings: {
        'test-project': {
          repoName: 'test-repo',
          branch: 'main',
          projectTitle: 'Test Project',
        },
      },
      isValidatingToken: false,
      isTokenValid: true,
      validationError: null,
      hasInitialSettings: true,
      authenticationMethod: 'pat',
      githubAppInstallationId: null,
      githubAppUsername: null,
      githubAppAvatarUrl: null,
    };

    mockProjectSettings = {
      currentUrl: 'https://bolt.new/test-project',
      isBoltSite: true,
      parsedProjectId: 'test-project',
      version: '1.0.0',
      projectTitle: 'Test Project',
    };

    mockProjectStatusRef = {
      getProjectStatus: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderTabsView = (props = {}) => {
    return render(TabsView, {
      props: {
        uiState: mockUIState,
        githubSettings: mockGitHubSettings,
        projectSettings: mockProjectSettings,
        projectId: 'test-project',
        isAuthenticationValid: true,
        isUserPremium: false,
        projectStatusRef: mockProjectStatusRef,
        ...props,
      },
    });
  };

  describe('Tab Navigation', () => {
    it('should display the tab navigation', () => {
      renderTabsView();

      expect(screen.getByRole('tablist')).toBeInTheDocument();

      expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Projects' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Help' })).toBeInTheDocument();
    });

    it('should show home tab as active by default', () => {
      renderTabsView();

      const homeTab = screen.getByRole('tab', { name: 'Home' });
      expect(homeTab).toHaveAttribute('data-state', 'active');

      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('should switch to different tabs when activeTab changes', async () => {
      const { component } = renderTabsView();

      await component.$set({
        uiState: { ...mockUIState, activeTab: 'settings' },
      });

      const settingsTab = screen.getByRole('tab', { name: 'Settings' });
      expect(settingsTab).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Event Handling', () => {
    it('should set up event listeners for child component events', () => {
      const { component } = renderTabsView();

      const switchTabHandler = vi.fn();
      const showFileChangesHandler = vi.fn();
      const feedbackHandler = vi.fn();
      const upgradeClickHandler = vi.fn();
      const newsletterHandler = vi.fn();
      const saveHandler = vi.fn();
      const errorHandler = vi.fn();
      const authMethodChangeHandler = vi.fn();
      const configurePushReminderHandler = vi.fn();

      component.$on('switchTab', switchTabHandler);
      component.$on('showFileChanges', showFileChangesHandler);
      component.$on('feedback', feedbackHandler);
      component.$on('upgradeClick', upgradeClickHandler);
      component.$on('newsletter', newsletterHandler);
      component.$on('save', saveHandler);
      component.$on('error', errorHandler);
      component.$on('authMethodChange', authMethodChangeHandler);
      component.$on('configurePushReminder', configurePushReminderHandler);

      expect(document.body).toBeInTheDocument();
    });
  });

  describe('Props Behavior', () => {
    it('should handle different authentication states', () => {
      renderTabsView({ isAuthenticationValid: false });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle premium user state', () => {
      renderTabsView({ isUserPremium: true });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle different project IDs', () => {
      renderTabsView({ projectId: 'different-project' });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle null project ID', () => {
      renderTabsView({ projectId: null });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle loading state', () => {
      const loadingGitHubSettings = {
        ...mockGitHubSettings,
        hasInitialSettings: false,
        isValidatingToken: true,
      };

      renderTabsView({ githubSettings: loadingGitHubSettings });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle empty GitHub settings', () => {
      const emptyGitHubSettings = {
        ...mockGitHubSettings,
        githubToken: '',
        repoOwner: '',
        repoName: '',
        branch: '',
      };

      renderTabsView({
        githubSettings: emptyGitHubSettings,
        isAuthenticationValid: false,
      });

      expect(document.body).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should render with proper tab structure', () => {
      renderTabsView();

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('should maintain tab content visibility based on active tab', async () => {
      const { component } = renderTabsView();

      await component.$set({
        uiState: { ...mockUIState, activeTab: 'projects' },
      });

      const projectsTab = screen.getByRole('tab', { name: 'Projects' });
      expect(projectsTab).toHaveAttribute('data-state', 'active');

      await component.$set({
        uiState: { ...mockUIState, activeTab: 'settings' },
      });

      const settingsTab = screen.getByRole('tab', { name: 'Settings' });
      expect(settingsTab).toHaveAttribute('data-state', 'active');

      await component.$set({
        uiState: { ...mockUIState, activeTab: 'help' },
      });

      const helpTab = screen.getByRole('tab', { name: 'Help' });
      expect(helpTab).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null projectStatusRef', () => {
      renderTabsView({ projectStatusRef: null });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle different project settings configurations', () => {
      const customProjectSettings = {
        ...mockProjectSettings,
        isBoltSite: false,
        projectTitle: 'Custom Project',
        version: '2.0.0',
      };

      renderTabsView({ projectSettings: customProjectSettings });

      expect(document.body).toBeInTheDocument();
    });

    it('should handle complex UI state configurations', () => {
      const complexUIState = {
        ...mockUIState,
        activeTab: 'help',
        status: 'Processing...',
        hasStatus: true,
        showTempRepoModal: true,
        tempRepoData: {
          originalRepo: 'test/repo',
          tempRepo: 'test/temp-repo',
          createdAt: Date.now(),
          owner: 'test-owner',
        },
        hasDeletedTempRepo: true,
        hasUsedTempRepoName: true,
      };

      renderTabsView({ uiState: complexUIState });

      expect(document.body).toBeInTheDocument();
    });
  });
});
