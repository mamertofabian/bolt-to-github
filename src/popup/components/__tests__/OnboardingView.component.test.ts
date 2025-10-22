/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import OnboardingView from '../OnboardingView.svelte';
import type { GitHubSettingsState, ProjectSettingsState, UIState } from '$lib/stores';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/WelcomeHero.svelte');
vi.unmock('$lib/components/OnboardingSetup.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

const chromeMocks = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ hasAccess: false }),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({ authenticationMethod: 'pat' }),
    },
  },
};

Object.defineProperty(window, 'chrome', {
  value: chromeMocks,
  writable: true,
  configurable: true,
});

describe('OnboardingView.svelte', () => {
  const mockGithubSettings: GitHubSettingsState = {
    hasInitialSettings: false,
    authenticationMethod: 'pat',
    githubAppInstallationId: null,
    githubAppUsername: null,
    githubAppAvatarUrl: null,
    githubToken: '',
    repoOwner: '',
    repoName: '',
    branch: 'main',
    projectSettings: {},
    isValidatingToken: false,
    isTokenValid: null,
    validationError: null,
  };

  const mockProjectSettings: ProjectSettingsState = {
    isBoltSite: true,
    currentUrl: 'https://bolt.new',
    parsedProjectId: null,
    version: '1.0.0',
    projectTitle: 'Test Project',
  };

  const mockUIState: UIState = {
    status: '',
    hasStatus: false,
    activeTab: 'upload',
    showTempRepoModal: false,
    tempRepoData: null,
    hasDeletedTempRepo: false,
    hasUsedTempRepoName: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Step 1 - Welcome Screen', () => {
    it('should render WelcomeHero component on step 1', () => {
      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      expect(screen.getByText('Welcome to Bolt to GitHub')).toBeInTheDocument();
      expect(screen.queryByText('Connect your GitHub account')).not.toBeInTheDocument();
    });

    it('should show "Visit bolt.new" button when not on bolt site', () => {
      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: { ...mockProjectSettings, isBoltSite: false },
          uiState: mockUIState,
        },
      });

      expect(screen.getByText('Visit bolt.new to start coding')).toBeInTheDocument();
    });

    it('should not show "Visit bolt.new" button when on bolt site', () => {
      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: { ...mockProjectSettings, isBoltSite: true },
          uiState: mockUIState,
        },
      });

      expect(screen.queryByText('Visit bolt.new to start coding')).not.toBeInTheDocument();
    });

    it('should open bolt.new in new tab when button is clicked', async () => {
      const user = userEvent.setup();
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: { ...mockProjectSettings, isBoltSite: false },
          uiState: mockUIState,
        },
      });

      const visitButton = screen.getByText('Visit bolt.new to start coding');
      await user.click(visitButton);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://bolt.new', '_blank');

      windowOpenSpy.mockRestore();
    });
  });

  describe('Step Navigation', () => {
    it('should advance to step 2 when Connect GitHub Account button is clicked', async () => {
      const user = userEvent.setup();

      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      expect(screen.getByText('Welcome to Bolt to GitHub')).toBeInTheDocument();
      expect(screen.queryByText('Connect your GitHub account')).not.toBeInTheDocument();

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.queryByText('Welcome to Bolt to GitHub')).not.toBeInTheDocument();
        expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
      });
    });
  });

  describe('Step 2 - Setup Screen', () => {
    it('should render OnboardingSetup component on step 2', async () => {
      const user = userEvent.setup();

      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
        expect(screen.getByText('Choose your preferred authentication method')).toBeInTheDocument();
      });
    });

    it('should show GitHub App and PAT options on step 2', async () => {
      const user = userEvent.setup();
      const settingsWithData: GitHubSettingsState = {
        ...mockGithubSettings,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
        githubAppAvatarUrl: 'https://avatar.url',
        githubToken: 'token123',
        repoOwner: 'owner',
      };

      render(OnboardingView, {
        props: {
          githubSettings: settingsWithData,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText(/GitHub App/i)).toBeInTheDocument();
        expect(screen.getByText(/Personal Access Token/i)).toBeInTheDocument();
      });
    });

    it('should handle PAT authentication method', async () => {
      const user = userEvent.setup();
      const settingsWithPAT: GitHubSettingsState = {
        ...mockGithubSettings,
        authenticationMethod: 'pat',
        githubToken: 'ghp_test123',
        repoOwner: 'test-owner',
      };

      render(OnboardingView, {
        props: {
          githubSettings: settingsWithPAT,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
      });
    });

    it('should display UI state status messages', async () => {
      const user = userEvent.setup();
      const customUIState: UIState = {
        ...mockUIState,
        status: 'Connecting to GitHub...',
        hasStatus: true,
      };

      render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: mockProjectSettings,
          uiState: customUIState,
        },
      });

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        const statusElements = screen.getAllByText('Connecting to GitHub...');
        expect(statusElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Event Handling', () => {
    it('should dispatch save event when Complete Setup is clicked', async () => {
      const user = userEvent.setup();
      const settingsComplete: GitHubSettingsState = {
        ...mockGithubSettings,
        authenticationMethod: 'github_app',
        githubAppInstallationId: 12345,
      };

      const { component } = render(OnboardingView, {
        props: {
          githubSettings: settingsComplete,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const saveHandler = vi.fn();
      component.$on('save', saveHandler);

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      await user.click(completeButton);

      expect(saveHandler).toHaveBeenCalled();
    });

    it('should dispatch authMethodChange event when switching authentication methods', async () => {
      const user = userEvent.setup();
      const { component } = render(OnboardingView, {
        props: {
          githubSettings: { ...mockGithubSettings, authenticationMethod: 'pat' },
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const authChangeHandler = vi.fn();
      component.$on('authMethodChange', authChangeHandler);

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText(/Personal Access Token/i)).toBeInTheDocument();
      });

      const githubAppRadio = screen.getByLabelText(/GitHub App/);
      await user.click(githubAppRadio);

      await waitFor(() => {
        expect(authChangeHandler).toHaveBeenCalled();
      });
    });
  });

  describe('Props Reactivity', () => {
    it('should react to githubSettings changes', async () => {
      const { component } = render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const updatedSettings: GitHubSettingsState = {
        ...mockGithubSettings,
        authenticationMethod: 'github_app',
        githubToken: 'new-token',
      };

      component.$set({ githubSettings: updatedSettings });

      await waitFor(() => {
        expect(component).toBeTruthy();
      });
    });

    it('should react to projectSettings changes and show/hide bolt.new button', async () => {
      const { component } = render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: { ...mockProjectSettings, isBoltSite: true },
          uiState: mockUIState,
        },
      });

      expect(screen.queryByText('Visit bolt.new to start coding')).not.toBeInTheDocument();

      const updatedProjectSettings: ProjectSettingsState = {
        ...mockProjectSettings,
        isBoltSite: false,
      };

      component.$set({ projectSettings: updatedProjectSettings });

      await waitFor(() => {
        expect(screen.getByText('Visit bolt.new to start coding')).toBeInTheDocument();
      });
    });

    it('should react to uiState changes', async () => {
      const user = userEvent.setup();
      const { component } = render(OnboardingView, {
        props: {
          githubSettings: mockGithubSettings,
          projectSettings: mockProjectSettings,
          uiState: mockUIState,
        },
      });

      const startButton = screen.getByRole('button', { name: /Connect GitHub Account/i });
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
      });

      const updatedUIState: UIState = {
        ...mockUIState,
        status: 'Loading...',
        hasStatus: true,
      };

      component.$set({ uiState: updatedUIState });

      await waitFor(() => {
        const statusElements = screen.getAllByText('Loading...');
        expect(statusElements.length).toBeGreaterThan(0);
      });
    });
  });
});
