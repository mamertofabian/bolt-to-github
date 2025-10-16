/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import RepoSettings from '../RepoSettings.svelte';

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
  listRepos: vi.fn(),
  listBranches: vi.fn(),
};

vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      constructor(_config?: unknown) {}
      async listRepos() {
        return mockState.listRepos();
      }
      async listBranches(owner: string, repo: string) {
        return mockState.listBranches(owner, repo);
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

vi.mock('$lib/services/chromeMessaging', () => ({
  ChromeMessagingService: {
    sendMessageToBackground: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('$lib/services/chromeStorage', () => ({
  ChromeStorageService: {
    saveProjectSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('RepoSettings.svelte - Component Tests', () => {
  let chromeMocks: {
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
      };
    };
  };

  const defaultProps = {
    show: true,
    repoOwner: 'testuser',
    githubToken: 'ghp_test123',
    projectId: 'project-123',
    repoName: '',
    branch: 'main',
    projectTitle: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.listRepos.mockResolvedValue([
      {
        name: 'awesome-project',
        description: 'An awesome TypeScript project',
        html_url: 'https://github.com/user/awesome-project',
        private: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        language: 'TypeScript',
      },
      {
        name: 'backend-api',
        description: 'REST API backend service',
        html_url: 'https://github.com/user/backend-api',
        private: true,
        created_at: '2024-01-03',
        updated_at: '2024-01-04',
        language: 'JavaScript',
      },
      {
        name: 'frontend-app',
        description: null,
        html_url: 'https://github.com/user/frontend-app',
        private: false,
        created_at: '2024-01-05',
        updated_at: '2024-01-06',
        language: 'TypeScript',
      },
    ]);

    chromeMocks = {
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering and Initial State', () => {
    it('should render Repository Settings heading', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByText('Repository Settings')).toBeInTheDocument();
    });

    it('should not render when show prop is false', () => {
      const props = { ...defaultProps, show: false };
      render(RepoSettings, { props });

      expect(screen.queryByText('Repository Settings')).not.toBeInTheDocument();
    });

    it('should render Project Title input field', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByLabelText('Project Title')).toBeInTheDocument();
    });

    it('should render Repository Name input field', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByLabelText('Repository Name')).toBeInTheDocument();
    });

    it('should render Branch input field', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByLabelText(/Branch/i)).toBeInTheDocument();
    });

    it('should render Save Settings button', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument();
    });

    it('should render Cancel button', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('should show placeholder text for Project Title', () => {
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Project Title');
      expect(input).toHaveAttribute('placeholder', 'Enter a descriptive title for this project');
    });

    it('should show placeholder text for Repository Name', () => {
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      expect(input).toHaveAttribute('placeholder', 'Search or enter repository name');
    });

    it('should show default branch placeholder', () => {
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText(/Branch/i);
      expect(input).toHaveAttribute('placeholder', 'main');
    });

    it('should display search icon in repository input', async () => {
      render(RepoSettings, { props: defaultProps });

      await waitFor(() => {
        const searchIcon = document.querySelector('svg.lucide-search');
        expect(searchIcon).toBeInTheDocument();
      });
    });
  });

  describe('Project Title Input', () => {
    it('should accept project title input', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Project Title');
      await user.type(input, 'My Awesome Project');

      expect(input).toHaveValue('My Awesome Project');
    });

    it('should display existing project title', () => {
      const props = { ...defaultProps, projectTitle: 'Existing Project' };
      render(RepoSettings, { props });

      const input = screen.getByLabelText('Project Title');
      expect(input).toHaveValue('Existing Project');
    });

    it('should clear project title when deleted', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, projectTitle: 'Project' };
      render(RepoSettings, { props });

      const input = screen.getByLabelText('Project Title');
      await user.clear(input);

      expect(input).toHaveValue('');
    });
  });

  describe('Repository Name Input and Dropdown', () => {
    it('should show loading spinner when loading repositories', async () => {
      let resolveRepos!: (value: unknown[]) => void;
      mockState.listRepos.mockReturnValue(
        new Promise((resolve) => {
          resolveRepos = resolve;
        })
      );

      render(RepoSettings, { props: defaultProps });

      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });

      resolveRepos([]);
    });

    it('should show search icon when not loading', async () => {
      mockState.listRepos.mockResolvedValue([]);
      render(RepoSettings, { props: defaultProps });

      await waitFor(() => {
        const searchIcon = document.querySelector('.lucide-search');
        expect(searchIcon).toBeInTheDocument();
      });
    });

    it('should show dropdown when repository input is focused', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });
    });

    it('should display repository list in dropdown', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
        expect(screen.getByText('backend-api')).toBeInTheDocument();
        expect(screen.getByText('frontend-app')).toBeInTheDocument();
      });
    });

    it('should display repository descriptions in dropdown', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('An awesome TypeScript project')).toBeInTheDocument();
        expect(screen.getByText('REST API backend service')).toBeInTheDocument();
      });
    });

    it('should show "Private" label for private repositories', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Private')).toBeInTheDocument();
      });
    });

    it('should show all repositories in dropdown when focused', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
        expect(screen.getByText('backend-api')).toBeInTheDocument();
        expect(screen.getByText('frontend-app')).toBeInTheDocument();
      });
    });

    it('should select repository when clicked from dropdown', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      const repoButton = screen.getByText('awesome-project').closest('button');
      if (repoButton) {
        await user.click(repoButton);
      }

      await waitFor(() => {
        expect(input).toHaveValue('awesome-project');
      });
    });

    it('should close dropdown after selecting repository', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      const repoButton = screen.getByText('awesome-project').closest('button');
      if (repoButton) {
        await user.click(repoButton);
      }

      await waitFor(() => {
        const dropdown = screen.queryByText('REST API backend service');
        expect(dropdown).not.toBeInTheDocument();
      });
    });

    it('should show default message when repository input is empty', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        const messageElements = screen.getAllByText(
          /Enter a repository name \(new\) or select from your repositories carefully/i
        );
        const messageElement = messageElements.find((el) =>
          el.classList.contains('text-orange-400')
        );
        expect(messageElement).toBeInTheDocument();
      });
    });

    it('should show info message when using existing repository', async () => {
      const props = { ...defaultProps, repoName: 'awesome-project' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(screen.getByText(/ℹ️ Using existing repository/i)).toBeInTheDocument();
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate down with ArrowDown key', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');

      const firstItem = screen.getByText('awesome-project').closest('button');
      expect(firstItem).toHaveClass('bg-slate-700');
    });

    it('should navigate up with ArrowUp key', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');

      const firstItem = screen.getByText('awesome-project').closest('button');
      expect(firstItem).toHaveClass('bg-slate-700');
    });

    it('should select repository with Enter key', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(input).toHaveValue('awesome-project');
      });
    });

    it('should close dropdown with Escape key', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        const dropdown = screen.queryByText('awesome-project');
        expect(dropdown).not.toBeInTheDocument();
      });
    });

    it('should not navigate beyond last item with ArrowDown', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      const lastItem = screen.getByText('frontend-app').closest('button');
      expect(lastItem).toHaveClass('bg-slate-700');
    });

    it('should not navigate beyond first item with ArrowUp', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowUp}');

      const firstRepoButton = screen.getByText('awesome-project').closest('button');
      expect(firstRepoButton).not.toHaveClass('bg-slate-700');
    });
  });

  describe('Branch Input', () => {
    it('should accept branch input', async () => {
      const { component } = render(RepoSettings, { props: defaultProps });

      // Use component.$set to update the prop (Svelte's two-way binding)
      await component.$set({ branch: 'develop' });

      const input = screen.getByLabelText(/Branch/i);
      expect(input).toHaveValue('develop');
    });

    it('should display existing branch value', () => {
      const props = { ...defaultProps, branch: 'feature' };
      render(RepoSettings, { props });

      const input = screen.getByLabelText(/Branch/i);
      expect(input).toHaveValue('feature');
    });

    it('should show branch creation info message', () => {
      render(RepoSettings, { props: defaultProps });

      expect(screen.getByText(/new branch will be created/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation and Save Button', () => {
    it('should disable save button when repository name is empty', () => {
      const props = { ...defaultProps, repoName: '' };
      render(RepoSettings, { props });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      expect(saveButton).toBeDisabled();
    });

    it('should disable save button when branch is empty', () => {
      const props = { ...defaultProps, repoName: 'test-repo', branch: '' };
      render(RepoSettings, { props });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when all required fields are filled', () => {
      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('Cancel Button', () => {
    it('should emit close event when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(RepoSettings, { props: defaultProps });

      const closeEventPromise = new Promise<void>((resolve) => {
        component.$on('close', () => resolve());
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      await expect(closeEventPromise).resolves.toBeUndefined();
    });
  });

  describe('Error Modal', () => {
    it('should show error modal when save fails', async () => {
      const user = userEvent.setup();
      const { ChromeStorageService } = await import('$lib/services/chromeStorage');
      vi.mocked(ChromeStorageService.saveProjectSettings).mockRejectedValue(
        new Error('Save failed')
      );

      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });

    it('should display error message in modal', async () => {
      const user = userEvent.setup();
      const { ChromeStorageService } = await import('$lib/services/chromeStorage');
      vi.mocked(ChromeStorageService.saveProjectSettings).mockRejectedValue(
        new Error('Save failed')
      );

      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to save settings. Please try again.')).toBeInTheDocument();
      });
    });

    it('should close error modal when OK button is clicked', async () => {
      const user = userEvent.setup();
      const { ChromeStorageService } = await import('$lib/services/chromeStorage');
      vi.mocked(ChromeStorageService.saveProjectSettings).mockRejectedValue(
        new Error('Save failed')
      );

      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      const saveButton = screen.getByRole('button', { name: /Save Settings/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });

      const okButton = screen.getAllByRole('button', { name: /OK/i })[0];
      await user.click(okButton);

      await waitFor(() => {
        expect(screen.queryByText('Error')).not.toBeInTheDocument();
      });
    });
  });

  describe('Visual States and Styling', () => {
    it('should render with dark theme styles', () => {
      render(RepoSettings, { props: defaultProps });

      const modal = document.querySelector('.bg-slate-900');
      expect(modal).toBeInTheDocument();
    });

    it('should show modal overlay', () => {
      render(RepoSettings, { props: defaultProps });

      const overlay = document.querySelector('.bg-black\\/50');
      expect(overlay).toBeInTheDocument();
    });

    it('should center modal on screen', () => {
      render(RepoSettings, { props: defaultProps });

      const container = document.querySelector('.flex.items-center.justify-center');
      expect(container).toBeInTheDocument();
    });
  });

  describe('GitHub App Authentication', () => {
    it('should load repositories with GitHub App authentication', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'github_app' });

      render(RepoSettings, { props: defaultProps });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });
    });

    it('should handle empty repository list', async () => {
      mockState.listRepos.mockResolvedValue([]);
      const user = userEvent.setup();

      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText('Repository Name');
      await user.click(input);

      await waitFor(() => {
        const messageElements = screen.getAllByText(
          /Enter a repository name \(new\) or select from your repositories/i
        );
        const messageElement = messageElements.find((el) =>
          el.classList.contains('text-orange-400')
        );
        expect(messageElement).toBeInTheDocument();
      });
    });
  });

  describe('Default Project Title', () => {
    it('should use repository name as default project title when rendered with repoName', () => {
      const props = { ...defaultProps, projectTitle: '', repoName: 'my-repo' };
      render(RepoSettings, { props });

      const titleInput = screen.getByLabelText('Project Title');
      expect(titleInput).toHaveValue('my-repo');
    });
  });

  describe('Branch Dropdown', () => {
    beforeEach(() => {
      mockState.listRepos.mockResolvedValue([
        {
          name: 'test-repo',
          description: 'Test repository',
          html_url: 'https://github.com/user/test-repo',
          private: false,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          language: 'TypeScript',
        },
      ]);

      mockState.listBranches.mockResolvedValue([
        {
          name: 'main',
          commit: {
            sha: 'abc123',
            url: 'https://api.github.com/repos/user/test-repo/commits/abc123',
          },
          protected: false,
        },
        {
          name: 'develop',
          commit: {
            sha: 'def456',
            url: 'https://api.github.com/repos/user/test-repo/commits/def456',
          },
          protected: false,
        },
        {
          name: 'feature/auth',
          commit: {
            sha: 'ghi789',
            url: 'https://api.github.com/repos/user/test-repo/commits/ghi789',
          },
          protected: false,
        },
      ]);
    });

    it('should show branch dropdown when branch input is focused', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      // Wait for repositories to load
      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      const branchInput = screen.getByLabelText(/Branch/i);
      await user.click(branchInput);

      await waitFor(() => {
        const dropdown = screen.queryByText('main');
        expect(dropdown).toBeInTheDocument();
      });
    });

    it('should show "+ Create new branch" option when input does not match existing branches', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: '' };
      const { component } = render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      // Wait for branches to load
      await waitFor(() => {
        expect(mockState.listBranches).toHaveBeenCalled();
      });

      // Set the branch prop to a new value
      await component.$set({ branch: 'new-feature' });

      const branchInput = screen.getByLabelText(/Branch/i) as HTMLInputElement;
      await user.click(branchInput);

      // Check that dropdown shows the create option
      await waitFor(
        () => {
          expect(screen.getByText(/Create new branch "new-feature"/i)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should hide "+ Create new branch" when branch exists', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      // Wait for branches to load
      await waitFor(() => {
        expect(mockState.listBranches).toHaveBeenCalled();
      });

      const branchInput = screen.getByLabelText(/Branch/i);
      await user.click(branchInput);

      await waitFor(() => {
        const createOption = screen.queryByText(/Create new branch/i);
        expect(createOption).not.toBeInTheDocument();
      });
    });

    it('should filter branches based on input text', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: '' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      const branchInput = screen.getByLabelText(/Branch/i);
      await user.click(branchInput);
      await user.type(branchInput, 'feat');

      await waitFor(() => {
        const filteredBranches = screen.queryAllByText(/feature/i);
        expect(filteredBranches.length).toBeGreaterThan(0);
      });
    });

    it('should select branch when clicked from dropdown', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: '' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      const branchInput = screen.getByLabelText(/Branch/i);
      await user.click(branchInput);

      await waitFor(() => {
        const mainBranch = screen.getByText('main');
        expect(mainBranch).toBeInTheDocument();
      });

      const mainBranchButton = screen.getByText('main').closest('button');
      if (mainBranchButton) {
        await user.click(mainBranchButton);
      }

      await waitFor(() => {
        expect(branchInput).toHaveValue('main');
      });
    });

    it('should close dropdown after selecting branch', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: '' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      const branchInput = screen.getByLabelText(/Branch/i);
      await user.click(branchInput);

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      const mainBranchButton = screen.getByText('main').closest('button');
      if (mainBranchButton) {
        await user.click(mainBranchButton);
      }

      await waitFor(() => {
        const dropdown = screen.queryByRole('button', { name: /main/i });
        expect(dropdown).not.toBeInTheDocument();
      });
    });

    it('should handle keyboard navigation in branch dropdown', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo', branch: '' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      const branchInput = screen.getByLabelText(/Branch/i);
      await user.click(branchInput);

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(branchInput).toHaveValue('main');
      });
    });

    it('should show appropriate status message for existing branch', async () => {
      const props = { ...defaultProps, repoName: 'test-repo', branch: 'main' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/Using existing branch/i)).toBeInTheDocument();
      });
    });

    it('should show appropriate status message for new branch', async () => {
      const props = { ...defaultProps, repoName: 'test-repo', branch: 'new-feature' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/new branch will be created/i)).toBeInTheDocument();
      });
    });
  });

  describe('Branch Loading Performance (Debouncing)', () => {
    beforeEach(() => {
      mockState.listRepos.mockResolvedValue([
        {
          name: 'test-repo',
          description: 'Test repository',
          html_url: 'https://github.com/user/test-repo',
          private: false,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
          language: 'TypeScript',
        },
      ]);

      mockState.listBranches.mockResolvedValue([
        {
          name: 'main',
          commit: {
            sha: 'abc123',
            url: 'https://api.github.com/repos/user/test-repo/commits/abc123',
          },
          protected: false,
        },
      ]);
    });

    it('should not call listBranches immediately while typing repository name', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      // Wait for initial repo load
      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      mockState.listBranches.mockClear();

      const repoInput = screen.getByLabelText('Repository Name');

      // Type first characters quickly
      await user.type(repoInput, 'tes');

      // Check immediately - should not be called yet due to debounce
      expect(mockState.listBranches).not.toHaveBeenCalled();
    });

    it('should call listBranches after debounce delay when typing stops', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      // Wait for initial repos to load (test-repo is in the mock)
      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      mockState.listBranches.mockClear();

      const repoInput = screen.getByLabelText('Repository Name');

      // Type repository name (test-repo exists in mock, so repoExists becomes true on last char)
      await user.type(repoInput, 'test-repo');

      // The debounce should fire after typing the last character
      // Wait for debounce delay (300ms) + some buffer for reactivity
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should be called after debounce completes
      expect(mockState.listBranches).toHaveBeenCalled();
      expect(mockState.listBranches).toHaveBeenCalledWith('testuser', 'test-repo');
    });

    it('should load branches immediately when selecting from dropdown', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      // Wait for repos to load (test-repo is in the mock from beforeEach)
      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      mockState.listBranches.mockClear();

      const repoInput = screen.getByLabelText('Repository Name');
      await user.click(repoInput);

      await waitFor(() => {
        expect(screen.getByText('test-repo')).toBeInTheDocument();
      });

      const repoButton = screen.getByText('test-repo').closest('button');
      if (repoButton) {
        await user.click(repoButton);
      }

      // Should load branches quickly when selecting from dropdown (bypasses debounce)
      await waitFor(() => {
        expect(mockState.listBranches).toHaveBeenCalledTimes(1);
        expect(mockState.listBranches).toHaveBeenCalledWith('testuser', 'test-repo');
      });
    });

    it('should not load branches multiple times for the same repository', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, repoName: 'test-repo' };
      render(RepoSettings, { props });

      await waitFor(() => {
        expect(mockState.listRepos).toHaveBeenCalled();
      });

      // Wait for initial branch load
      await new Promise((resolve) => setTimeout(resolve, 400));

      await waitFor(() => {
        expect(mockState.listBranches).toHaveBeenCalledTimes(1);
      });

      const initialCallCount = mockState.listBranches.mock.calls.length;

      const repoInput = screen.getByLabelText('Repository Name');

      // Clear and type the same repo name again
      await user.clear(repoInput);
      await user.type(repoInput, 'test-repo');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Should not load branches again for same repo
      expect(mockState.listBranches).toHaveBeenCalledTimes(initialCallCount);
    });
  });
});
