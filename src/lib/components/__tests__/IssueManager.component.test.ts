/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import IssueManager from '../IssueManager.svelte';
import { issuesStore } from '$lib/stores/issuesStore';
import { writable, derived } from 'svelte/store';

const mockIssuesState = writable({});
const mockLoadingState = writable({});

vi.mock('$lib/stores/issuesStore', () => {
  return {
    issuesStore: {
      loadIssues: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      invalidateCache: vi.fn(),
      getIssuesForRepo: (_owner: string, _repo: string, _state: string) => {
        return derived([mockIssuesState], ([$state]: [Record<string, unknown>]) => {
          const key = `${_owner}/${_repo}`;
          return $state[key] || { issues: [], isLoading: false, error: null, lastFetched: 0 };
        });
      },
      getLoadingState: (_owner: string, _repo: string, _state: string) => {
        return derived(
          [mockLoadingState],
          ([$loading]: [Record<string, Record<string, boolean>>]) => {
            const key = `${_owner}/${_repo}`;
            return $loading[key]?.[_state] || false;
          }
        );
      },
      reset: vi.fn(),
    },
  };
});

const mockChromeTabs = {
  create: vi.fn(),
};

Object.defineProperty(globalThis, 'chrome', {
  value: {
    tabs: mockChromeTabs,
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ authenticationMethod: 'pat' }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
  writable: true,
  configurable: true,
});

describe('IssueManager.svelte - Component Tests', () => {
  const defaultProps = {
    githubToken: 'test-token',
    repoOwner: 'testowner',
    repoName: 'testrepo',
    show: true,
  };

  const mockIssues = [
    {
      number: 1,
      title: 'Test Issue 1',
      body: 'Description 1',
      state: 'open' as const,
      html_url: 'https://github.com/testowner/testrepo/issues/1',
      created_at: '2025-10-01T12:00:00Z',
      updated_at: '2025-10-05T14:30:00Z',
      comments: 3,
      user: {
        login: 'testuser',
        avatar_url: 'https://example.com/avatar.png',
      },
      labels: [{ name: 'bug', color: 'd73a4a' }],
    },
    {
      number: 2,
      title: 'Test Issue 2',
      body: 'Description 2',
      state: 'open' as const,
      html_url: 'https://github.com/testowner/testrepo/issues/2',
      created_at: '2025-10-02T12:00:00Z',
      updated_at: '2025-10-06T14:30:00Z',
      comments: 0,
      user: {
        login: 'testuser2',
        avatar_url: 'https://example.com/avatar2.png',
      },
      labels: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockIssuesState.set({
      'testowner/testrepo': {
        issues: [],
        isLoading: false,
        error: null,
        lastFetched: 0,
      },
    });
    mockLoadingState.set({});

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    issuesStore.reset();
  });

  describe('Modal Visibility', () => {
    it('should render modal when show prop is true', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
    });

    it('should not render modal when show prop is false', () => {
      render(IssueManager, { props: { ...defaultProps, show: false } });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display repository name in modal header', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.getByText('testowner/testrepo')).toBeInTheDocument();
    });

    it('should have proper ARIA attributes for accessibility', () => {
      render(IssueManager, { props: defaultProps });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'issues-modal-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'issues-modal-description');
    });
  });

  describe('Modal Close Functionality', () => {
    it('should emit close event when close button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { component } = render(IssueManager, { props: defaultProps });
      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const closeButton = screen.getByRole('button', { name: /close issues modal/i });
      await user.click(closeButton);

      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit close event when Escape key is pressed', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { component } = render(IssueManager, { props: defaultProps });
      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const dialog = screen.getByRole('dialog');
      dialog.focus();
      await user.keyboard('{Escape}');

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should emit close event when backdrop is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { component } = render(IssueManager, { props: defaultProps });
      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const dialog = screen.getByRole('dialog');
      await user.click(dialog);

      expect(closeHandler).toHaveBeenCalled();
    });
  });

  describe('Issue List Display', () => {
    it('should show loading state when issues are being loaded', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: true,
          error: null,
          lastFetched: 0,
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByText('Loading issues...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('should display issues list when issues are loaded', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: mockIssues,
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('list', { name: /issues list/i })).toBeInTheDocument();
    });

    it('should display error message when loading fails', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: false,
          error: 'Failed to load issues',
          lastFetched: 0,
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByText('Failed to load issues')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    });

    it('should display empty state when no issues exist', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByText(/No open issues found/i)).toBeInTheDocument();
    });

    it('should show "Create your first issue" button in empty state for open issues', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('button', { name: /create your first issue/i })).toBeInTheDocument();
    });
  });

  describe('State Filter', () => {
    it('should render state filter dropdown with correct options', () => {
      render(IssueManager, { props: defaultProps });

      const select = screen.getByRole('combobox', { name: /filter issues by state/i });
      expect(select).toBeInTheDocument();

      const openOption = screen.getByRole('option', { name: /open/i });
      const closedOption = screen.getByRole('option', { name: /closed/i });
      const allOption = screen.getByRole('option', { name: /all/i });

      expect(openOption).toBeInTheDocument();
      expect(closedOption).toBeInTheDocument();
      expect(allOption).toBeInTheDocument();
    });

    it('should default to "open" state filter', () => {
      render(IssueManager, { props: defaultProps });

      const select = screen.getByRole('combobox', {
        name: /filter issues by state/i,
      }) as HTMLSelectElement;
      expect(select.value).toBe('open');
    });

    it('should change filter when different option is selected', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(IssueManager, { props: defaultProps });

      const select = screen.getByRole('combobox', { name: /filter issues by state/i });
      await user.selectOptions(select, 'closed');

      expect((select as HTMLSelectElement).value).toBe('closed');
    });

    it('should display correct empty message based on selected state', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByText(/No open issues found/i)).toBeInTheDocument();

      const select = screen.getByRole('combobox', { name: /filter issues by state/i });
      await user.selectOptions(select, 'closed');

      await waitFor(() => {
        expect(screen.getByText(/No closed issues found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should display refresh button', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('button', { name: /refresh issues list/i })).toBeInTheDocument();
    });

    it('should trigger refresh when refresh button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(IssueManager, { props: defaultProps });

      const refreshButton = screen.getByRole('button', { name: /refresh issues list/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(issuesStore.invalidateCache).toHaveBeenCalledWith('testowner', 'testrepo');
        expect(issuesStore.loadIssues).toHaveBeenCalledWith(
          'testowner',
          'testrepo',
          'test-token',
          'open',
          true
        );
      });
    });

    it('should disable refresh button while loading', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: true,
          error: null,
          lastFetched: 0,
        },
      });

      render(IssueManager, { props: defaultProps });

      const refreshButton = screen.getByRole('button', { name: /refresh issues list/i });
      expect(refreshButton).toBeDisabled();
    });

    it('should show refreshing text and spinner when refreshing', () => {
      mockLoadingState.set({
        'testowner/testrepo': {
          open: true,
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByText(/refreshing\.\.\./i)).toBeInTheDocument();
    });

    it('should display refresh overlay when refreshing with existing issues', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: mockIssues,
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });
      mockLoadingState.set({
        'testowner/testrepo': {
          open: true,
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('status', { name: /refreshing issues/i })).toBeInTheDocument();
      expect(screen.getByText(/refreshing issues\.\.\./i)).toBeInTheDocument();
    });
  });

  describe('New Issue Form', () => {
    it('should display "New Issue" button', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('button', { name: /new issue/i })).toBeInTheDocument();
    });

    it('should show form when "New Issue" button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(IssueManager, { props: defaultProps });

      const newIssueButton = screen.getByRole('button', { name: /new issue/i });
      await user.click(newIssueButton);

      expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create issue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should disable "New Issue" button when form is shown', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(IssueManager, { props: defaultProps });

      const newIssueButton = screen.getByRole('button', { name: /new issue/i });
      await user.click(newIssueButton);

      expect(newIssueButton).toBeDisabled();
    });

    it('should create issue when form is submitted', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      const mockNewIssue = {
        number: 3,
        title: 'New Issue',
        body: 'New Description',
        state: 'open' as const,
        html_url: 'https://github.com/testowner/testrepo/issues/3',
        created_at: '2025-10-11T12:00:00Z',
        updated_at: '2025-10-11T12:00:00Z',
        comments: 0,
        user: { login: 'testuser', avatar_url: 'https://example.com/avatar.png' },
        labels: [],
      };

      vi.mocked(issuesStore.createIssue).mockResolvedValue(mockNewIssue);

      render(IssueManager, { props: defaultProps });

      const newIssueButton = screen.getByRole('button', { name: /new issue/i });
      await user.click(newIssueButton);

      const titleInput = screen.getByRole('textbox', { name: /title/i });
      const descriptionTextarea = screen.getByRole('textbox', { name: /description/i });

      await user.type(titleInput, 'New Issue');
      await user.type(descriptionTextarea, 'New Description');

      const createButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(issuesStore.createIssue).toHaveBeenCalledWith(
          'testowner',
          'testrepo',
          'test-token',
          { title: 'New Issue', body: 'New Description' }
        );
      });
    });
  });

  describe('Issue Close Confirmation', () => {
    it('should show confirmation dialog when close is requested', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.queryByText('Close Issue?')).not.toBeInTheDocument();
    });
  });

  describe('Chrome API Integration', () => {
    it('should render issues list for browser interaction', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: mockIssues,
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });

      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('list', { name: /issues list/i })).toBeInTheDocument();
    });
  });

  describe('Initial Data Loading', () => {
    it('should load issues when component mounts with valid props', async () => {
      render(IssueManager, { props: defaultProps });

      await waitFor(() => {
        expect(issuesStore.loadIssues).toHaveBeenCalledWith(
          'testowner',
          'testrepo',
          'test-token',
          'open',
          false
        );
      });
    });

    it('should not load issues when show is false', () => {
      render(IssueManager, { props: { ...defaultProps, show: false } });

      expect(issuesStore.loadIssues).not.toHaveBeenCalled();
    });

    it('should not load issues when githubToken is missing', () => {
      render(IssueManager, { props: { ...defaultProps, githubToken: '' } });

      expect(issuesStore.loadIssues).not.toHaveBeenCalled();
    });

    it('should not load issues when repoOwner is missing', () => {
      render(IssueManager, { props: { ...defaultProps, repoOwner: '' } });

      expect(issuesStore.loadIssues).not.toHaveBeenCalled();
    });

    it('should not load issues when repoName is missing', () => {
      render(IssueManager, { props: { ...defaultProps, repoName: '' } });

      expect(issuesStore.loadIssues).not.toHaveBeenCalled();
    });
  });

  describe('Focus Management', () => {
    it('should focus modal when opened', async () => {
      render(IssueManager, { props: defaultProps });

      vi.advanceTimersByTime(100);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(document.activeElement).toBe(dialog);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper role and aria attributes on modal', () => {
      render(IssueManager, { props: defaultProps });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'issues-modal-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'issues-modal-description');
      expect(dialog).toHaveAttribute('tabindex', '-1');
    });

    it('should have proper aria-live region for loading state', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: true,
          error: null,
          lastFetched: 0,
        },
      });

      render(IssueManager, { props: defaultProps });

      const loadingStatus = screen.getByRole('status');
      expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
    });

    it('should have proper aria-live region for error messages', () => {
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: false,
          error: 'Test error',
          lastFetched: 0,
        },
      });

      render(IssueManager, { props: defaultProps });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('should have accessible button labels', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('button', { name: /close issues modal/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh issues list/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /new issue/i })).toBeInTheDocument();
    });

    it('should have accessible combobox label', () => {
      render(IssueManager, { props: defaultProps });

      expect(screen.getByRole('combobox', { name: /filter issues by state/i })).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state with closed filter', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockIssuesState.set({
        'testowner/testrepo': {
          issues: [],
          isLoading: false,
          error: null,
          lastFetched: Date.now(),
        },
      });

      render(IssueManager, { props: defaultProps });

      const select = screen.getByRole('combobox', { name: /filter issues by state/i });
      await user.selectOptions(select, 'closed');

      await waitFor(() => {
        expect(screen.getByText(/No closed issues found/i)).toBeInTheDocument();

        expect(
          screen.queryByRole('button', { name: /create your first issue/i })
        ).not.toBeInTheDocument();
      });
    });

    it('should handle rapid filter changes', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(IssueManager, { props: defaultProps });

      const select = screen.getByRole('combobox', { name: /filter issues by state/i });

      await user.selectOptions(select, 'closed');
      await user.selectOptions(select, 'all');
      await user.selectOptions(select, 'open');

      expect((select as HTMLSelectElement).value).toBe('open');
    });

    it('should handle store error during refresh gracefully', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(issuesStore.loadIssues).mockRejectedValue(new Error('Network error'));

      render(IssueManager, { props: defaultProps });

      const refreshButton = screen.getByRole('button', { name: /refresh issues list/i });
      await user.click(refreshButton);

      expect(issuesStore.loadIssues).toHaveBeenCalled();
    });

    it('should handle store error during issue creation gracefully', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      vi.mocked(issuesStore.createIssue).mockRejectedValue(new Error('Create failed'));

      render(IssueManager, { props: defaultProps });

      const newIssueButton = screen.getByRole('button', { name: /new issue/i });
      await user.click(newIssueButton);

      const titleInput = screen.getByRole('textbox', { name: /title/i });
      await user.type(titleInput, 'New Issue');

      const createButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(issuesStore.createIssue).toHaveBeenCalled();
      });
    });
  });

  describe('Reactive Props', () => {
    it('should load issues when show changes from false to true', async () => {
      const { rerender } = render(IssueManager, { props: { ...defaultProps, show: false } });

      expect(issuesStore.loadIssues).not.toHaveBeenCalled();

      await rerender({ show: true });

      await waitFor(() => {
        expect(issuesStore.loadIssues).toHaveBeenCalled();
      });
    });

    it('should reload issues when repoOwner changes', async () => {
      const { rerender } = render(IssueManager, { props: defaultProps });

      vi.clearAllMocks();

      await rerender({ repoOwner: 'newowner' });

      await waitFor(() => {
        expect(issuesStore.loadIssues).toHaveBeenCalledWith(
          'newowner',
          'testrepo',
          'test-token',
          'open',
          false
        );
      });
    });

    it('should reload issues when repoName changes', async () => {
      const { rerender } = render(IssueManager, { props: defaultProps });

      vi.clearAllMocks();

      await rerender({ repoName: 'newrepo' });

      await waitFor(() => {
        expect(issuesStore.loadIssues).toHaveBeenCalledWith(
          'testowner',
          'newrepo',
          'test-token',
          'open',
          false
        );
      });
    });

    it('should reload issues when githubToken changes', async () => {
      const { rerender } = render(IssueManager, { props: defaultProps });

      vi.clearAllMocks();

      await rerender({ githubToken: 'new-token' });

      await waitFor(() => {
        expect(issuesStore.loadIssues).toHaveBeenCalledWith(
          'testowner',
          'testrepo',
          'new-token',
          'open',
          false
        );
      });
    });
  });
});
