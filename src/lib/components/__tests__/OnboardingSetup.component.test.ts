/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import OnboardingSetup from '../OnboardingSetup.svelte';

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
  TUTORIAL_LINK: 'https://example.com/tutorial',
  CREATE_TOKEN_URL: 'https://github.com/settings/tokens/new',
}));

vi.mock('$lib/stores/githubSettings', () => ({
  githubSettingsActions: {
    setAuthenticationMethod: vi.fn(),
  },
}));

describe('OnboardingSetup.svelte - Component Tests', () => {
  const defaultGithubSettings = {
    authenticationMethod: 'pat' as const,
    githubAppInstallationId: undefined,
    githubAppUsername: undefined,
    githubAppAvatarUrl: undefined,
    githubToken: '',
    repoOwner: '',
  };

  const defaultUiState = {
    status: undefined,
    hasStatus: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering and Initial State', () => {
    it('should render the component with heading', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument();
    });

    it('should render both authentication method options', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText('GitHub App')).toBeInTheDocument();
      expect(screen.getByText('Personal Access Token')).toBeInTheDocument();
    });

    it('should show recommended badge for GitHub App', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('should show advanced badge for PAT', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });

    it('should have GitHub App selected by default when no authentication method is set', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: undefined,
          },
          uiState: defaultUiState,
        },
      });

      const githubAppRadio = screen.getByRole('radio', { name: /GitHub App/i });
      expect(githubAppRadio).toBeChecked();
    });

    it('should have PAT selected when authenticationMethod is pat', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      const patRadio = screen.getByRole('radio', { name: /Personal Access Token/i });
      expect(patRadio).toBeChecked();
    });
  });

  describe('Authentication Method Selection', () => {
    it('should dispatch authMethodChange event when switching to GitHub App', async () => {
      const user = userEvent.setup();
      let dispatchedMethod: string | undefined;

      const { component } = render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      component.$on('authMethodChange', (event) => {
        dispatchedMethod = event.detail;
      });

      const githubAppRadio = screen.getByRole('radio', { name: /GitHub App/i });
      await user.click(githubAppRadio);

      expect(dispatchedMethod).toBe('github_app');
    });

    it('should dispatch authMethodChange event when switching to PAT', async () => {
      const user = userEvent.setup();
      let dispatchedMethod: string | undefined;

      const { component } = render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      component.$on('authMethodChange', (event) => {
        dispatchedMethod = event.detail;
      });

      const patRadio = screen.getByRole('radio', { name: /Personal Access Token/i });
      await user.click(patRadio);

      expect(dispatchedMethod).toBe('pat');
    });

    it('should update radio selection when clicked', async () => {
      const user = userEvent.setup();

      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      const githubAppRadio = screen.getByRole('radio', { name: /GitHub App/i });
      await user.click(githubAppRadio);

      expect(githubAppRadio).toBeChecked();
    });
  });

  describe('GitHub App UI', () => {
    it('should show connect button when GitHub App is not connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.getByRole('button', { name: /Connect with GitHub App/i })).toBeInTheDocument();
    });

    it('should open GitHub App auth URL when connect button is clicked', async () => {
      const user = userEvent.setup();
      const mockOpen = vi.fn();
      window.open = mockOpen;

      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      const connectButton = screen.getByRole('button', { name: /Connect with GitHub App/i });
      await user.click(connectButton);

      expect(mockOpen).toHaveBeenCalledWith('https://bolt2github.com/github/auth', '_blank');
    });

    it('should display step-by-step guide when not connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText('What happens next:')).toBeInTheDocument();
      expect(screen.getByText(/Click "Connect with GitHub App"/i)).toBeInTheDocument();
      expect(screen.getByText(/Authorize the GitHub App/i)).toBeInTheDocument();
      expect(screen.getByText(/Return to the extension/i)).toBeInTheDocument();
    });

    it('should show connected state when installation ID exists', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
            githubAppUsername: 'testuser',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText(/Connected as testuser/i)).toBeInTheDocument();
    });

    it('should display avatar when connected with avatar URL', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
            githubAppUsername: 'testuser',
            githubAppAvatarUrl: 'https://example.com/avatar.jpg',
          },
          uiState: defaultUiState,
        },
      });

      const avatar = screen.getByAltText('Profile');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('should not show step-by-step guide when connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
            githubAppUsername: 'testuser',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.queryByText('What happens next:')).not.toBeInTheDocument();
    });

    it('should not show connect button when connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
            githubAppUsername: 'testuser',
          },
          uiState: defaultUiState,
        },
      });

      expect(
        screen.queryByRole('button', { name: /Connect with GitHub App/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('PAT UI', () => {
    it('should show token input when PAT is selected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      const tokenInput = screen.getByPlaceholderText(/ghp_/i);
      expect(tokenInput).toBeInTheDocument();
      expect(tokenInput).toHaveAttribute('type', 'password');
    });

    it('should show create token link', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      const createTokenLink = screen.getByRole('link', { name: /Create token/i });
      expect(createTokenLink).toBeInTheDocument();
      expect(createTokenLink).toHaveAttribute('href', 'https://github.com/settings/tokens/new');
      expect(createTokenLink).toHaveAttribute('target', '_blank');
    });

    it('should bind token input to githubSettings.githubToken', async () => {
      const user = userEvent.setup();

      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      const tokenInput = screen.getByPlaceholderText(/ghp_/i) as HTMLInputElement;
      await user.type(tokenInput, 'ghp_test123');

      await waitFor(() => {
        expect(tokenInput.value).toBe('ghp_test123');
      });
    });

    it('should show check icon when token is provided', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
            githubToken: 'ghp_test123',
          },
          uiState: defaultUiState,
        },
      });

      const checkIcon = document.querySelector('.text-green-500');
      expect(checkIcon).toBeInTheDocument();
    });

    it('should not show token input when GitHub App is selected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.queryByPlaceholderText(/ghp_/i)).not.toBeInTheDocument();
    });
  });

  describe('Repository Owner Input', () => {
    it('should show repository owner input when PAT is selected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.getByLabelText(/Repository Owner/i)).toBeInTheDocument();
    });

    it('should bind repository owner input to githubSettings.repoOwner', async () => {
      const user = userEvent.setup();

      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
          },
          uiState: defaultUiState,
        },
      });

      const ownerInput = screen.getByLabelText(/Repository Owner/i) as HTMLInputElement;
      await user.type(ownerInput, 'testuser');

      await waitFor(() => {
        expect(ownerInput.value).toBe('testuser');
      });
    });

    it('should not show repository owner input when GitHub App is selected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      expect(screen.queryByLabelText(/Repository Owner/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Completion and Submit', () => {
    it('should disable Complete Setup button when GitHub App is not connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).toBeDisabled();
    });

    it('should enable Complete Setup button when GitHub App is connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).not.toBeDisabled();
    });

    it('should disable Complete Setup button when PAT credentials are incomplete', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
            githubToken: 'ghp_test123',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).toBeDisabled();
    });

    it('should enable Complete Setup button when PAT credentials are complete', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
            githubToken: 'ghp_test123',
            repoOwner: 'testuser',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).not.toBeDisabled();
    });

    it('should dispatch save event when Complete Setup is clicked', async () => {
      const user = userEvent.setup();
      let saveDispatched = false;

      const { component } = render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
          },
          uiState: defaultUiState,
        },
      });

      component.$on('save', () => {
        saveDispatched = true;
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      await user.click(completeButton);

      expect(saveDispatched).toBe(true);
    });

    it('should disable button when uiState.hasStatus is true', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
          },
          uiState: {
            status: 'Processing...',
            hasStatus: true,
          },
        },
      });

      const completeButton = screen.getByRole('button', { name: /Processing.../i });
      expect(completeButton).toBeDisabled();
    });
  });

  describe('Status Messages', () => {
    it('should display status message when provided', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: {
            status: 'Connecting to GitHub...',
            hasStatus: true,
          },
        },
      });

      const statusParagraph = document.querySelector('.text-blue-200');
      expect(statusParagraph).toBeInTheDocument();
      expect(statusParagraph).toHaveTextContent('Connecting to GitHub...');
    });

    it('should show status in button text when hasStatus is true', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
          },
          uiState: {
            status: 'Saving...',
            hasStatus: true,
          },
        },
      });

      expect(screen.getByRole('button', { name: /Saving.../i })).toBeInTheDocument();
    });

    it('should not display status message when status is undefined', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: {
            status: undefined,
            hasStatus: false,
          },
        },
      });

      expect(screen.queryByText(/Connecting to GitHub/i)).not.toBeInTheDocument();
    });

    it('should show Complete Setup button text when no status with MAX_WRITE_OPERATIONS', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
          },
          uiState: {
            status: 'MAX_WRITE_OPERATIONS_PER_HOUR exceeded',
            hasStatus: true,
          },
        },
      });

      expect(screen.getByRole('button', { name: /Complete Setup/i })).toBeInTheDocument();
    });
  });

  describe('Help and Tutorial Links', () => {
    it('should display help link with correct URL', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      const helpLink = screen.getByRole('link', { name: /Need help.*Watch setup tutorial/i });
      expect(helpLink).toBeInTheDocument();
      expect(helpLink).toHaveAttribute('href', 'https://example.com/tutorial');
      expect(helpLink).toHaveAttribute('target', '_blank');
    });
  });

  describe('Security Features Display', () => {
    it('should show security features for GitHub App option', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(screen.getByText('Enhanced security')).toBeInTheDocument();
      expect(screen.getByText('One-time setup')).toBeInTheDocument();
    });

    it('should show description for GitHub App authentication', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(
        screen.getByText('Secure authentication with automatic token refresh')
      ).toBeInTheDocument();
    });

    it('should show description for PAT authentication', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: defaultGithubSettings,
          uiState: defaultUiState,
        },
      });

      expect(
        screen.getByText(/Manually provide your GitHub token.*requires manual token creation/i)
      ).toBeInTheDocument();
    });
  });

  describe('Reactive isSetupComplete', () => {
    it('should consider setup incomplete when GitHub App is selected but not connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).toBeDisabled();
    });

    it('should consider setup complete when GitHub App is connected', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'github_app',
            githubAppInstallationId: 12345,
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).not.toBeDisabled();
    });

    it('should consider setup incomplete when PAT is selected without token', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
            repoOwner: 'testuser',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).toBeDisabled();
    });

    it('should consider setup incomplete when PAT is selected without repoOwner', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
            githubToken: 'ghp_test123',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).toBeDisabled();
    });

    it('should consider setup complete when PAT has both token and repoOwner', () => {
      render(OnboardingSetup, {
        props: {
          githubSettings: {
            ...defaultGithubSettings,
            authenticationMethod: 'pat',
            githubToken: 'ghp_test123',
            repoOwner: 'testuser',
          },
          uiState: defaultUiState,
        },
      });

      const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
      expect(completeButton).not.toBeDisabled();
    });
  });
});
