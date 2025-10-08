/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import GitHubSettings from '../GitHubSettings.svelte';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
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

const mockState = {
  validateTokenAndUser: vi.fn(),
  isClassicToken: vi.fn(),
  listRepos: vi.fn(),
  verifyTokenPermissions: vi.fn(),
  submitFeedback: vi.fn(),
};

vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      constructor(_config?: unknown) {}
      async validateTokenAndUser(username: string) {
        return mockState.validateTokenAndUser(username);
      }
      async isClassicToken() {
        return mockState.isClassicToken();
      }
      async listRepos() {
        return mockState.listRepos();
      }
      async verifyTokenPermissions(
        owner: string,
        callback: (result: { permission: string; isValid: boolean }) => void
      ) {
        return mockState.verifyTokenPermissions(owner, callback);
      }
    },
  };
});

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('$lib/constants', () => ({
  GITHUB_APP_AUTH_URL: 'https://bolt2github.com/github/auth',
}));

describe('GitHubSettings.svelte - Component Tests', () => {
  let chromeMocks: {
    runtime: {
      lastError?: { message: string };
      sendMessage: ReturnType<typeof vi.fn>;
    };
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
      sync: {
        get: ReturnType<typeof vi.fn>;
      };
      onChanged: {
        addListener: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
      };
    };
  };

  const defaultProps = {
    isOnboarding: false,
    githubToken: '',
    repoOwner: '',
    repoName: '',
    branch: 'main',
    status: '',
    onSave: vi.fn(),
    onInput: vi.fn(),
    onError: null,
    projectId: null,
    projectSettings: {},
    buttonDisabled: false,
    authenticationMethod: 'pat' as const,
    githubAppInstallationId: null,
    githubAppUsername: null,
    githubAppAvatarUrl: null,
    onAuthMethodChange: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });
    mockState.isClassicToken.mockResolvedValue(true);
    mockState.listRepos.mockResolvedValue([]);
    mockState.verifyTokenPermissions.mockResolvedValue({ isValid: true });

    chromeMocks = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ preferredAuthMethod: 'pat' }),
          set: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering and Initial State', () => {
    it('should render GitHub Settings heading', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByText('GitHub Settings')).toBeInTheDocument();
    });

    it('should render collapsed by default when settings are populated', async () => {
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test123',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        branch: 'main',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.queryByLabelText('GitHub Token')).not.toBeInTheDocument();
      });
    });

    it('should render expanded by default during onboarding', () => {
      const props = {
        ...defaultProps,
        isOnboarding: true,
      };

      render(GitHubSettings, { props });

      expect(screen.getByLabelText(/GitHub Token/i)).toBeInTheDocument();
    });

    it('should render expanded when settings are incomplete', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByLabelText(/GitHub Token/i)).toBeInTheDocument();
    });

    it('should display status text for PAT authentication', async () => {
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/Configured for testuser\/testrepo/)).toBeInTheDocument();
      });
    });

    it('should display status text for GitHub App authentication', async () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        githubAppInstallationId: 12345,
        githubAppUsername: 'appuser',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/Connected via GitHub App as appuser/)).toBeInTheDocument();
      });
    });
  });

  describe('Authentication Method Selection', () => {
    it('should render both authentication method options', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByText('GitHub App')).toBeInTheDocument();
      expect(screen.getByText('Personal Access Token')).toBeInTheDocument();
    });

    it('should have PAT selected by default', () => {
      render(GitHubSettings, { props: defaultProps });

      const patRadio = screen.getByRole('radio', { name: /Personal Access Token/i });
      expect(patRadio).toBeChecked();
    });

    it('should have GitHub App selected when prop is set', () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
      };

      render(GitHubSettings, { props });

      const githubAppRadio = screen.getByRole('radio', { name: /GitHub App/i });
      expect(githubAppRadio).toBeChecked();
    });

    it('should allow switching from PAT to GitHub App', async () => {
      const user = userEvent.setup();
      const onAuthMethodChange = vi.fn();

      const props = {
        ...defaultProps,
        onAuthMethodChange,
      };

      render(GitHubSettings, { props });

      const githubAppRadio = screen.getByRole('radio', { name: /GitHub App/i });
      await user.click(githubAppRadio);

      expect(onAuthMethodChange).toHaveBeenCalledWith('github_app');
    });

    it('should allow switching from GitHub App to PAT', async () => {
      const user = userEvent.setup();
      const onAuthMethodChange = vi.fn();

      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        onAuthMethodChange,
      };

      render(GitHubSettings, { props });

      const patRadio = screen.getByRole('radio', { name: /Personal Access Token/i });
      await user.click(patRadio);

      expect(onAuthMethodChange).toHaveBeenCalledWith('pat');
    });

    it('should save authentication method preference to storage', async () => {
      const user = userEvent.setup();

      render(GitHubSettings, { props: defaultProps });

      const githubAppRadio = screen.getByRole('radio', { name: /GitHub App/i });
      await user.click(githubAppRadio);

      await waitFor(() => {
        expect(chromeMocks.storage.local.set).toHaveBeenCalledWith({
          preferredAuthMethod: 'github_app',
        });
      });
    });
  });

  describe('PAT Authentication UI', () => {
    it('should render GitHub Token input field when PAT is selected', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByLabelText(/GitHub Token/i)).toBeInTheDocument();
    });

    it('should accept token input', async () => {
      const user = userEvent.setup();
      const onInput = vi.fn();

      const props = {
        ...defaultProps,
        onInput,
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'ghp_test123');

      expect(onInput).toHaveBeenCalled();
    });

    it('should show validation spinner when validating token', async () => {
      const user = userEvent.setup();
      let resolveValidation!: (value: { isValid: boolean }) => void;
      mockState.validateTokenAndUser.mockReturnValue(
        new Promise((resolve) => {
          resolveValidation = resolve;
        })
      );

      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'ghp_test123');

      await waitFor(
        () => {
          const spinner = document.querySelector('.animate-spin');
          expect(spinner).toBeInTheDocument();
        },
        { timeout: 1000 }
      );

      resolveValidation({ isValid: true });
    });

    it('should show check icon when token is valid', async () => {
      const user = userEvent.setup();
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });

      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'ghp_test123');

      await waitFor(() => {
        const checkIcon = document.querySelector('.text-green-500');
        expect(checkIcon).toBeInTheDocument();
      });
    });

    it('should show error icon when token is invalid', async () => {
      const user = userEvent.setup();
      mockState.validateTokenAndUser.mockResolvedValue({
        isValid: false,
        error: 'Invalid token',
      });

      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'invalid_token');

      await waitFor(() => {
        const errorIcon = document.querySelector('.text-red-500');
        expect(errorIcon).toBeInTheDocument();
        expect(screen.getByText('Invalid token')).toBeInTheDocument();
      });
    });

    it('should display token type when validation succeeds', async () => {
      const user = userEvent.setup();
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });
      mockState.isClassicToken.mockResolvedValue(true);

      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'ghp_test123');

      await waitFor(() => {
        expect(screen.getByText(/Classic token detected/i)).toBeInTheDocument();
      });
    });

    it('should display fine-grained token type', async () => {
      const user = userEvent.setup();
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });
      mockState.isClassicToken.mockResolvedValue(false);

      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'github_pat_test123');

      await waitFor(() => {
        expect(screen.getByText(/Fine-grained token detected/i)).toBeInTheDocument();
      });
    });

    it('should render repository owner input', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByLabelText(/Repository Owner/i)).toBeInTheDocument();
    });

    it('should accept repository owner input', async () => {
      const user = userEvent.setup();
      const onInput = vi.fn();

      const props = {
        ...defaultProps,
        onInput,
      };

      render(GitHubSettings, { props });

      const ownerInput = screen.getByLabelText(/Repository Owner/i);
      await user.type(ownerInput, 'testuser');

      expect(onInput).toHaveBeenCalled();
    });
  });

  describe('GitHub App Authentication UI', () => {
    it('should show connect button when GitHub App is not connected', () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
      };

      render(GitHubSettings, { props });

      const connectButton = screen.getByRole('button', { name: /^Connect with GitHub$/ });
      expect(connectButton).toBeInTheDocument();
    });

    it('should show connected state when GitHub App is authenticated', async () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
        githubAppAvatarUrl: 'https://example.com/avatar.jpg',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/Connected as testuser/i)).toBeInTheDocument();
      });
    });

    it('should show avatar when GitHub App is connected', async () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
        githubAppAvatarUrl: 'https://example.com/avatar.jpg',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        const avatar = screen.getByAltText('Profile');
        expect(avatar).toBeInTheDocument();
        expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
      });
    });

    it('should open GitHub App auth URL when connect button is clicked', async () => {
      const user = userEvent.setup();
      const mockOpen = vi.fn();
      window.open = mockOpen;

      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
      };

      render(GitHubSettings, { props });

      const connectButton = screen.getByRole('button', { name: /^Connect with GitHub$/ });
      await user.click(connectButton);

      expect(mockOpen).toHaveBeenCalledWith('https://bolt2github.com/github/auth', '_blank');
    });

    it('should disable repository owner input when GitHub App is selected', () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        repoOwner: 'appuser',
      };

      render(GitHubSettings, { props });

      const ownerInput = screen.getByLabelText(/Repository Owner/i);
      expect(ownerInput).toBeDisabled();
    });
  });

  describe('Collapsible Behavior', () => {
    it('should toggle expanded state when header is clicked', async () => {
      const user = userEvent.setup();
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.queryByLabelText(/GitHub Token/i)).not.toBeInTheDocument();
      });

      const header = screen.getByRole('button', { name: /GitHub Settings/i });
      await user.click(header);

      await waitFor(() => {
        expect(screen.getByLabelText(/GitHub Token/i)).toBeInTheDocument();
      });

      await user.click(header);

      await waitFor(() => {
        expect(screen.queryByLabelText(/GitHub Token/i)).not.toBeInTheDocument();
      });
    });

    it('should toggle with keyboard Enter key', async () => {
      const user = userEvent.setup();
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      render(GitHubSettings, { props });

      const header = screen.getByRole('button', { name: /GitHub Settings/i });
      header.focus();
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByLabelText(/GitHub Token/i)).toBeInTheDocument();
      });
    });

    it('should show chevron down icon when collapsed', async () => {
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        const svg = document.querySelector('svg[class*="lucide-chevron-down"]');
        expect(svg).toBeInTheDocument();
      });
    });

    it('should show chevron up icon when expanded', () => {
      render(GitHubSettings, { props: defaultProps });

      const svg = document.querySelector('svg[class*="lucide-chevron-up"]');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should disable save button when required fields are missing', () => {
      render(GitHubSettings, { props: defaultProps });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      expect(saveButton).toBeDisabled();
    });

    it('should call onSave when save button is clicked', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });

      const props = {
        ...defaultProps,
        githubToken: 'ghp_test123',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        onSave,
      };

      render(GitHubSettings, { props });

      const header = screen.getByRole('button', { name: /GitHub Settings/i });
      await user.click(header);

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /Save Settings/i });
        expect(saveButton).not.toBeDisabled();
      });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalled();
    });

    it('should show custom status text when buttonDisabled is true', async () => {
      const user = userEvent.setup();
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        buttonDisabled: true,
        status: 'Uploading...',
      };

      render(GitHubSettings, { props });

      const header = screen.getByRole('button', { name: /GitHub Settings/i });
      await user.click(header);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Uploading.../i })).toBeInTheDocument();
      });
    });

    it('should display "Get Started" button text during onboarding', () => {
      const props = {
        ...defaultProps,
        isOnboarding: true,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      expect(screen.getByRole('button', { name: /Get Started/i })).toBeInTheDocument();
    });
  });

  describe('Storage Quota Error Handling', () => {
    it('should display storage quota error message', async () => {
      const user = userEvent.setup();
      const onSave = vi
        .fn()
        .mockRejectedValue(new Error('Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR'));

      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        onSave,
      };

      render(GitHubSettings, { props });

      const header = screen.getByRole('button', { name: /GitHub Settings/i });
      await user.click(header);

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /Save Settings/i });
        expect(saveButton).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Storage Limit Exceeded/i)).toBeInTheDocument();
      });
    });

    it('should call onError when storage quota error occurs', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();
      const onSave = vi
        .fn()
        .mockRejectedValue(new Error('Quota exceeded: MAX_WRITE_OPERATIONS_PER_HOUR'));

      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
        onSave,
        onError,
      };

      render(GitHubSettings, { props });

      const header = screen.getByRole('button', { name: /GitHub Settings/i });
      await user.click(header);

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /Save Settings/i });
        expect(saveButton).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe('Loading and Error States', () => {
    it('should show validation error message', async () => {
      const user = userEvent.setup();
      const errorMsg = 'Invalid credentials';
      mockState.validateTokenAndUser.mockResolvedValue({
        isValid: false,
        error: errorMsg,
      });

      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'invalid_token');

      await waitFor(() => {
        expect(screen.getByText(errorMsg)).toBeInTheDocument();
      });
    });
  });

  describe('Project-specific Settings', () => {
    it('should show project-specific section for non-onboarding mode', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByText(/Project Repository Settings/i)).toBeInTheDocument();
    });

    it('should not show project-specific section during onboarding', () => {
      const props = {
        ...defaultProps,
        isOnboarding: true,
      };

      render(GitHubSettings, { props });

      expect(screen.queryByText(/Project Repository Settings/i)).not.toBeInTheDocument();
    });

    it('should display project ID in section header when available', () => {
      const props = {
        ...defaultProps,
        projectId: 'test-project-123',
      };

      render(GitHubSettings, { props });

      expect(screen.getByText(/For current project only/i)).toBeInTheDocument();
    });

    it('should display default settings label when no project ID', () => {
      render(GitHubSettings, { props: defaultProps });

      expect(screen.getByText(/Default settings/i)).toBeInTheDocument();
    });
  });

  describe('Visual Feedback', () => {
    it('should show connected icon for valid PAT authentication', async () => {
      const props = {
        ...defaultProps,
        githubToken: 'ghp_test',
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      mockState.validateTokenAndUser.mockResolvedValue({ isValid: true });

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/Configured for testuser\/testrepo/)).toBeInTheDocument();
      });
    });

    it('should show error icon for invalid PAT authentication', async () => {
      const user = userEvent.setup();
      const props = {
        ...defaultProps,
        repoOwner: 'testuser',
      };

      mockState.validateTokenAndUser.mockResolvedValue({
        isValid: false,
        error: 'Invalid token',
      });

      render(GitHubSettings, { props });

      const tokenInput = screen.getByLabelText(/GitHub Token/i);
      await user.type(tokenInput, 'ghp_invalid');

      await waitFor(() => {
        const errorIcon = document.querySelector('.text-red-500');
        expect(errorIcon).toBeInTheDocument();
      });
    });

    it('should show connected icon for GitHub App authentication', async () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        githubAppInstallationId: 12345,
        githubAppUsername: 'testuser',
        repoName: 'testrepo',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/Connected via GitHub App as testuser/i)).toBeInTheDocument();
      });
    });

    it('should show not connected state for GitHub App without installation', async () => {
      const props = {
        ...defaultProps,
        authenticationMethod: 'github_app' as const,
        repoOwner: 'testuser',
        repoName: 'testrepo',
      };

      render(GitHubSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/Connect with GitHub App to get started/i)).toBeInTheDocument();
      });
    });
  });
});
