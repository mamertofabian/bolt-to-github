/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
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
};

vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      constructor(_config?: unknown) {}
      async listRepos() {
        return mockState.listRepos();
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
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const input = screen.getByLabelText(/Branch/i);
      await user.clear(input);
      await user.type(input, 'develop');

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

      expect(
        screen.getByText(/If the branch doesn't exist, it will be created automatically/i)
      ).toBeInTheDocument();
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
    it('should use repository name as default project title when rendered with repoName', async () => {
      const props = { ...defaultProps, projectTitle: '', repoName: 'my-repo' };
      render(RepoSettings, { props });

      const titleInput = screen.getByLabelText('Project Title');

      // Wait for onMount to set the default title
      await waitFor(() => {
        expect(titleInput).toHaveValue('my-repo');
      });
    });
  });

  describe('Editable Fields', () => {
    it('should allow editing project title after it has been set', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, projectTitle: 'Initial Title', repoName: 'my-repo' };
      render(RepoSettings, { props });

      const titleInput = screen.getByLabelText('Project Title') as HTMLInputElement;
      expect(titleInput).toHaveValue('Initial Title');

      // Triple click to select all text, then type new value
      await user.tripleClick(titleInput);
      await user.keyboard('New Project Title');

      expect(titleInput).toHaveValue('New Project Title');
    });

    it('should allow editing project title without being overridden by repository name', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, projectTitle: '', repoName: 'my-repo' };
      render(RepoSettings, { props });

      const titleInput = screen.getByLabelText('Project Title');

      // Wait for onMount to set the default title
      await waitFor(() => {
        expect(titleInput).toHaveValue('my-repo');
      });

      // User edits the title
      await user.clear(titleInput);
      await user.type(titleInput, 'Custom Title');

      // Should retain user's custom title
      expect(titleInput).toHaveValue('Custom Title');
    });

    it('should allow editing repository name after initial selection', async () => {
      const props = { ...defaultProps, repoName: 'initial-repo' };
      render(RepoSettings, { props });

      const repoInput = screen.getByLabelText('Repository Name') as HTMLInputElement;
      expect(repoInput).toHaveValue('initial-repo');

      // Directly set input value and trigger input event (simulating user typing over selection)
      fireEvent.input(repoInput, { target: { value: 'new-repo-name' } });

      expect(repoInput).toHaveValue('new-repo-name');
    });

    it('should allow changing repository name after selecting from dropdown', async () => {
      const user = userEvent.setup();
      render(RepoSettings, { props: defaultProps });

      const repoInput = screen.getByLabelText('Repository Name') as HTMLInputElement;

      // Select from dropdown
      await user.click(repoInput);
      await waitFor(() => {
        expect(screen.getByText('awesome-project')).toBeInTheDocument();
      });

      const repoButton = screen.getByText('awesome-project').closest('button');
      if (repoButton) {
        await user.click(repoButton);
      }

      await waitFor(() => {
        expect(repoInput).toHaveValue('awesome-project');
      });

      // Directly set input value and trigger input event (simulating user typing over selection)
      fireEvent.input(repoInput, { target: { value: 'modified-awesome-project' } });

      expect(repoInput).toHaveValue('modified-awesome-project');
    });

    it('should not override project title when repository name changes', async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps, projectTitle: 'My Custom Title', repoName: 'repo1' };
      render(RepoSettings, { props });

      const titleInput = screen.getByLabelText('Project Title');
      const repoInput = screen.getByLabelText('Repository Name');

      expect(titleInput).toHaveValue('My Custom Title');

      // Change repository name
      await user.clear(repoInput);
      await user.type(repoInput, 'repo2');

      // Project title should remain unchanged
      expect(titleInput).toHaveValue('My Custom Title');
    });
  });
});
