/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SettingsTabContent from '../SettingsTabContent.svelte';
import type { GitHubSettingsState } from '$lib/stores/githubSettings';
import type { UIState } from '$lib/stores/uiState';

vi.mock('$lib/services/GitHubApiClient', () => ({
  createGitHubService: vi.fn().mockResolvedValue({
    listRepos: vi.fn().mockResolvedValue([]),
    validateToken: vi.fn().mockResolvedValue({ isValid: true }),
  }),
}));

const mockChromeTabsCreate = vi.fn();
const mockChromeRuntimeGetURL = vi.fn();

describe('SettingsTabContent', () => {
  let mockGitHubSettings: GitHubSettingsState;
  let mockUIState: UIState;
  let mockProjectId: string;
  let mockIsUserPremium: boolean;

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'chrome', {
      value: {
        tabs: {
          create: mockChromeTabsCreate,
        },
        runtime: {
          getURL: mockChromeRuntimeGetURL.mockReturnValue(
            'chrome-extension://test-id/src/pages/logs.html'
          ),
        },
      },
      writable: true,
      configurable: true,
    });

    mockGitHubSettings = {
      githubToken: 'test-token',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      projectSettings: {},
      isValidatingToken: false,
      isTokenValid: true,
      validationError: null,
      hasInitialSettings: true,
      authenticationMethod: 'pat',
      githubAppInstallationId: null,
      githubAppUsername: null,
      githubAppAvatarUrl: null,
    };

    mockUIState = {
      activeTab: 'settings',
      status: '',
      hasStatus: false,
      showTempRepoModal: false,
      tempRepoData: null,
      hasDeletedTempRepo: false,
      hasUsedTempRepoName: false,
    };

    mockProjectId = 'test-project-123';
    mockIsUserPremium = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render all main sections', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      expect(screen.getByRole('button', { name: /view developer logs/i })).toBeInTheDocument();

      expect(
        screen.getByRole('button', {
          name: /github settings configured for test-owner\/test-repo/i,
        })
      ).toBeInTheDocument();
    });

    it('should render premium status section', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      expect(screen.getByText(/premium status/i)).toBeInTheDocument();
    });

    it('should render push reminder section', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      expect(screen.getByRole('heading', { name: /push reminders/i })).toBeInTheDocument();
    });

    it('should render analytics toggle', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      expect(screen.getByRole('heading', { name: /privacy & analytics/i })).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should open developer logs when button is clicked', async () => {
      const user = userEvent.setup();

      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      const logsButton = screen.getByRole('button', { name: /view developer logs/i });
      await user.click(logsButton);

      expect(mockChromeTabsCreate).toHaveBeenCalledWith({
        url: 'chrome-extension://test-id/src/pages/logs.html',
      });
    });

    it('should handle form interactions in GitHub settings', async () => {
      const user = userEvent.setup();

      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      const settingsHeader = screen.getByRole('button', {
        name: /github settings configured for test-owner\/test-repo/i,
      });
      await user.click(settingsHeader);

      const ownerField = screen.getByRole('textbox', {
        name: /repository owner \(your github username\)/i,
      });
      const nameField = screen.getByRole('textbox', { name: /repository name/i });
      const branchField = screen.getByRole('textbox', { name: /branch \(usually "main"\)/i });

      expect(ownerField).not.toBeDisabled();
      expect(nameField).not.toBeDisabled();
      expect(branchField).not.toBeDisabled();

      await user.type(ownerField, 'new-owner');
      await user.type(nameField, 'new-repo');
      await user.type(branchField, 'develop');

      expect(ownerField).toHaveValue('test-ownernew-owner');
      expect(nameField).toHaveValue('test-reponew-repo');
      expect(branchField).toHaveValue('maindevelop');
    });

    it('should handle premium upgrade interactions', async () => {
      const user = userEvent.setup();
      const { component } = render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: false,
        },
      });

      const upgradeHandler = vi.fn();
      component.$on('upgradeClick', upgradeHandler);

      const upgradeButton = screen.getByRole('button', { name: /upgrade to premium/i });
      await user.click(upgradeButton);

      expect(upgradeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'general',
        })
      );
    });

    it('should handle push reminder configuration for premium users', async () => {
      const user = userEvent.setup();
      const { component } = render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: true,
        },
      });

      const configureHandler = vi.fn();
      component.$on('configurePushReminder', configureHandler);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });
      await user.click(configureButton);

      expect(configureHandler).toHaveBeenCalled();
    });

    it('should show upgrade prompt for push reminders when user is not premium', async () => {
      const user = userEvent.setup();
      const { component } = render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: false,
        },
      });

      const upgradeHandler = vi.fn();
      component.$on('upgradeClick', upgradeHandler);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });
      await user.click(configureButton);

      expect(upgradeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'pushReminders',
        })
      );
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form elements when expanded', async () => {
      const user = userEvent.setup();

      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      const settingsHeader = screen.getByRole('button', {
        name: /github settings configured for test-owner\/test-repo/i,
      });
      await user.click(settingsHeader);

      expect(
        screen.getByRole('textbox', { name: /repository owner \(your github username\)/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /repository name/i })).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /branch \(usually "main"\)/i })
      ).toBeInTheDocument();
    });

    it('should have accessible buttons', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      const logsButton = screen.getByRole('button', { name: /view developer logs/i });
      expect(logsButton).toBeInTheDocument();
      expect(logsButton).toHaveAttribute('type', 'button');
      expect(logsButton).not.toBeDisabled();
    });

    it('should have proper button roles and labels', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      expect(screen.getByRole('button', { name: /view developer logs/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upgrade to premium/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /configure push reminders/i })).toBeInTheDocument();
    });
  });

  describe('Props Behavior', () => {
    it('should handle different premium states', () => {
      const { rerender } = render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: false,
        },
      });

      expect(screen.getByText(/premium status/i)).toBeInTheDocument();

      rerender({
        githubSettings: mockGitHubSettings,
        projectId: mockProjectId,
        uiState: mockUIState,
        isUserPremium: true,
      });

      expect(screen.getByText(/premium status/i)).toBeInTheDocument();
    });

    it('should handle different UI states', async () => {
      const user = userEvent.setup();

      const { rerender } = render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: { ...mockUIState, hasStatus: true, status: 'Processing...' },
          isUserPremium: mockIsUserPremium,
        },
      });

      const settingsHeader = screen.getByRole('button', {
        name: /github settings configured for test-owner\/test-repo/i,
      });
      await user.click(settingsHeader);

      const saveButton = screen.getByRole('button', { name: /processing\.\.\./i });
      expect(saveButton).toBeDisabled();

      rerender({
        githubSettings: mockGitHubSettings,
        projectId: mockProjectId,
        uiState: { ...mockUIState, hasStatus: false },
        isUserPremium: mockIsUserPremium,
      });

      expect(screen.getByRole('button', { name: /view developer logs/i })).toBeInTheDocument();
    });

    it('should handle different project IDs', () => {
      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: null,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      expect(screen.getByRole('button', { name: /view developer logs/i })).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should render without crashing when Chrome API is unavailable', () => {
      Object.defineProperty(window, 'chrome', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      render(SettingsTabContent, {
        props: {
          githubSettings: mockGitHubSettings,
          projectId: mockProjectId,
          uiState: mockUIState,
          isUserPremium: mockIsUserPremium,
        },
      });

      const logsButton = screen.getByRole('button', { name: /view developer logs/i });
      expect(logsButton).toBeInTheDocument();

      Object.defineProperty(window, 'chrome', {
        value: {
          tabs: {
            create: mockChromeTabsCreate,
          },
          runtime: {
            getURL: mockChromeRuntimeGetURL.mockReturnValue(
              'chrome-extension://test-id/src/pages/logs.html'
            ),
          },
        },
        writable: true,
        configurable: true,
      });
    });
  });
});
