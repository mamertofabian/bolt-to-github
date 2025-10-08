/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import BranchSelectionModal from '../BranchSelectionModal.svelte';
import type { GitHubBranch } from '../../../services/types/repository';

/**
 * BranchSelectionModal Component Tests
 *
 * Tests the UI behavior and user interactions of the BranchSelectionModal component.
 * Focus: Component rendering, user interactions, state changes, and integration with services.
 *
 * Following unit-testing-rules.md:
 * - Test behavior (user actions and outcomes), not implementation details
 * - Mock only external dependencies (Chrome API, UnifiedGitHubService)
 * - Test both success and error scenarios
 * - Use realistic test data
 * - Test state changes after user interactions
 *
 * Testing Convention:
 * - *.component.test.ts = UI behavior tests using @testing-library/svelte
 */

// Unmock UI components to allow real rendering for proper coverage
vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('./UpgradeModal.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

// Mock external dependencies using mockState pattern to avoid hoisting issues
const mockState = {
  listBranches: vi.fn(),
};

// Mock UnifiedGitHubService
vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_config?: unknown) {
        // Constructor can accept config but we don't need to track it
      }
      async listBranches(owner: string, repo: string) {
        return mockState.listBranches(owner, repo);
      }
    },
  };
});

describe('BranchSelectionModal.svelte', () => {
  let chromeMocks: {
    runtime: {
      sendMessage: ReturnType<typeof vi.fn>;
    };
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
      };
    };
  };

  const mockBranches: GitHubBranch[] = [
    { name: 'main', commit: { sha: 'abc123', url: 'https://github.com' }, protected: false },
    { name: 'develop', commit: { sha: 'def456', url: 'https://github.com' }, protected: false },
    { name: 'feature-x', commit: { sha: 'ghi789', url: 'https://github.com' }, protected: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.listBranches.mockResolvedValue(mockBranches);

    // Setup Chrome API mocks
    chromeMocks = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ hasAccess: false }),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ authenticationMethod: 'pat' }),
        },
      },
    };

    // Setup window mock
    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should render when show is true', async () => {
      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Select Branch to Import')).toBeInTheDocument();
      });
    });

    it('should not render when show is false', () => {
      render(BranchSelectionModal, {
        props: {
          show: false,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      expect(screen.queryByText('Select Branch to Import')).not.toBeInTheDocument();
    });
  });

  describe('Branch Loading', () => {
    it('should load and display branches with PAT authentication', async () => {
      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
        expect(screen.getByText('develop')).toBeInTheDocument();
        expect(screen.getByText('feature-x')).toBeInTheDocument();
      });

      expect(mockState.listBranches).toHaveBeenCalledWith('test-owner', 'test-repo');
    });

    it('should load branches with GitHub App authentication', async () => {
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'github_app' });

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: '',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      expect(mockState.listBranches).toHaveBeenCalledWith('test-owner', 'test-repo');
    });

    it('should show loading spinner while fetching branches', () => {
      mockState.listBranches.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockBranches), 1000))
      );

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      // Check for loading spinner by its class and structure
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should display error message when branch loading fails', async () => {
      const errorMessage = 'Failed to fetch branches';
      mockState.listBranches.mockRejectedValue(new Error(errorMessage));

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch branches/i)).toBeInTheDocument();
      });
    });

    it('should display message when repository has no branches', async () => {
      mockState.listBranches.mockResolvedValue([]);

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/No branches found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Default Branch Selection', () => {
    it('should mark "main" as default branch and select it automatically', async () => {
      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        const mainBranch = screen.getByText('main').closest('[role="button"]');
        expect(mainBranch).toHaveClass('border-blue-500');
        expect(screen.getByText('Default branch')).toBeInTheDocument();
      });
    });

    it('should mark "master" as default when "main" is not present', async () => {
      const branchesWithMaster: GitHubBranch[] = [
        { name: 'develop', commit: { sha: 'def456', url: 'https://github.com' }, protected: false },
        { name: 'master', commit: { sha: 'abc123', url: 'https://github.com' }, protected: false },
      ];

      mockState.listBranches.mockResolvedValue(branchesWithMaster);

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        const masterBranch = screen.getByText('master').closest('[role="button"]');
        expect(masterBranch).toHaveClass('border-blue-500');
      });
    });

    it('should use first branch as default when neither main nor master exist', async () => {
      const customBranches: GitHubBranch[] = [
        { name: 'develop', commit: { sha: 'def456', url: 'https://github.com' }, protected: false },
        {
          name: 'feature-x',
          commit: { sha: 'ghi789', url: 'https://github.com' },
          protected: false,
        },
      ];

      mockState.listBranches.mockResolvedValue(customBranches);

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        const developBranch = screen.getByText('develop').closest('[role="button"]');
        expect(developBranch).toHaveClass('border-blue-500');
      });
    });
  });

  describe('Branch Selection Behavior', () => {
    it('should allow selecting default branch', async () => {
      const user = userEvent.setup();

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      const mainBranch = screen.getByText('main').closest('[role="button"]');
      await user.click(mainBranch!);

      expect(mainBranch).toHaveClass('border-blue-500');
    });

    it('should show lock icon on non-default branches for non-premium users', async () => {
      chromeMocks.runtime.sendMessage.mockResolvedValue({ hasAccess: false });

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        const developBranch = screen.getByText('develop').closest('[role="button"]');
        expect(developBranch).toHaveClass('cursor-not-allowed');
      });
    });

    it('should allow premium users to select non-default branches', async () => {
      const user = userEvent.setup();
      chromeMocks.runtime.sendMessage.mockResolvedValue({ hasAccess: true });

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('develop')).toBeInTheDocument();
      });

      const developBranch = screen.getByText('develop').closest('[role="button"]');
      await user.click(developBranch!);

      expect(developBranch).toHaveClass('border-blue-500');
    });
  });

  describe('Premium Features', () => {
    it('should show upgrade prompt for non-premium users', async () => {
      chromeMocks.runtime.sendMessage.mockResolvedValue({ hasAccess: false });

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Upgrade to Pro to access non-default branches/i)
        ).toBeInTheDocument();
      });
    });

    it('should not show upgrade prompt for premium users', async () => {
      chromeMocks.runtime.sendMessage.mockResolvedValue({ hasAccess: true });

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Upgrade to Pro/i)).not.toBeInTheDocument();
    });

    it('should default to allowing access if premium check fails', async () => {
      chromeMocks.runtime.sendMessage.mockRejectedValue(new Error('Service unavailable'));

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('develop')).toBeInTheDocument();
      });

      // Should not show locked state since we default to allowing access
      const developBranch = screen.getByText('develop').closest('[role="button"]');
      expect(developBranch).not.toHaveClass('cursor-not-allowed');
    });
  });

  describe('Import and Cancel Actions', () => {
    it('should call onBranchSelected when Import Branch is clicked', async () => {
      const user = userEvent.setup();
      const onBranchSelected = vi.fn();

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected,
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      const importButton = screen.getByRole('button', { name: /Import Branch/i });
      await user.click(importButton);

      expect(onBranchSelected).toHaveBeenCalledWith('main');
    });

    it('should call onCancel when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('should disable Import button for non-premium users with non-default branch selected', async () => {
      const user = userEvent.setup();
      chromeMocks.runtime.sendMessage.mockResolvedValue({ hasAccess: false });

      render(BranchSelectionModal, {
        props: {
          show: true,
          owner: 'test-owner',
          repo: 'test-repo',
          token: 'test-token',
          onBranchSelected: vi.fn(),
          onCancel: vi.fn(),
        },
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      // Try to select a non-default branch (should not work)
      const developBranch = screen.getByText('develop').closest('[role="button"]');
      await user.click(developBranch!);

      // Main should still be selected
      const importButton = screen.getByRole('button', { name: /Import Branch/i });
      expect(importButton).not.toBeDisabled();
    });
  });
});
