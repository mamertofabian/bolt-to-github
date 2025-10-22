/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FileChangesModal from '../FileChangesModal.svelte';
import type { FileChange } from '../../../services/FilePreviewService';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/ui/dialog/ConfirmationDialog.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('FileChangesModal.svelte', () => {
  let chromeMocks: {
    runtime: {
      sendMessage: ReturnType<typeof vi.fn>;
    };
    tabs: {
      query: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };
  };

  const createFileChangesMap = (
    changes: Array<[string, Omit<FileChange, 'content'> & { content?: string }]>
  ): Map<string, FileChange> => {
    return new Map(
      changes.map(([path, change]) => [path, { ...change, content: change.content || '' }])
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    chromeMocks = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 123 }]),
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
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

  describe('Modal Visibility', () => {
    it('should render when show is true', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        const headings = screen.getAllByRole('heading', { name: 'File Changes' });
        expect(headings.length).toBeGreaterThan(0);
      });
    });

    it('should not render when show is false', () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: false,
          fileChanges,
        },
      });

      expect(screen.queryByRole('heading', { name: 'File Changes' })).not.toBeInTheDocument();
    });
  });

  describe('File Changes Display', () => {
    it('should display summary with added files', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
        ['file2.ts', { status: 'added', path: 'file2.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/2 added/)).toBeInTheDocument();
      });
    });

    it('should display summary with modified files', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'modified', path: 'file1.ts' }],
        ['file2.ts', { status: 'modified', path: 'file2.ts' }],
        ['file3.ts', { status: 'modified', path: 'file3.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/3 modified/)).toBeInTheDocument();
      });
    });

    it('should display summary with deleted files', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'deleted', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/1 deleted/)).toBeInTheDocument();
      });
    });

    it('should display summary with mixed changes', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
        ['file2.ts', { status: 'modified', path: 'file2.ts' }],
        ['file3.ts', { status: 'deleted', path: 'file3.ts' }],
        ['file4.ts', { status: 'unchanged', path: 'file4.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        const elements = screen.getAllByText((content, element) => {
          const text = element?.textContent || '';
          return (
            text.includes('1 added') &&
            text.includes('1 modified') &&
            text.includes('1 deleted') &&
            text.includes('1 unchanged')
          );
        });
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should display message when all files are unchanged', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
        ['file2.ts', { status: 'unchanged', path: 'file2.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/All 2 files are up to date/)).toBeInTheDocument();
      });
    });

    it('should display analyzing message when fileChanges is null', async () => {
      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges: null,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Analyzing project files.../)).toBeInTheDocument();
      });
    });

    it('should display no changes message when fileChanges is null in content area', async () => {
      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges: null,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/No file changes to display/)).toBeInTheDocument();
      });
    });
  });

  describe('Button States', () => {
    it('should show Push button with count when there are changes', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
        ['file2.ts', { status: 'modified', path: 'file2.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(2\)/)).toBeInTheDocument();
      });
    });

    it('should show Push button with no changes text when all files unchanged', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(No changes\)/)).toBeInTheDocument();
      });
    });

    it('should show Push button with no changes indicator when all files unchanged', async () => {
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        const pushButton = screen.getByText(/Push \(No changes\)/);
        expect(pushButton).toBeInTheDocument();
        const button = pushButton.closest('button');
        expect(button).toHaveAttribute('title', 'No changes to push (will show confirmation)');
      });
    });

    it('should disable Refresh button while refreshing', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.sendMessage.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
      const refreshingButton = screen.getByText('Refreshing...').closest('button');
      expect(refreshingButton).toBeDisabled();
    });

    it('should disable Push button while refreshing', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.sendMessage.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      const pushButton = screen.getByText(/Push \(1\)/).closest('button');
      expect(pushButton).toBeDisabled();
    });
  });

  describe('Push to GitHub', () => {
    it('should send PUSH_TO_GITHUB message when Push is clicked with changes', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(1\)/)).toBeInTheDocument();
      });

      const pushButton = screen.getByText(/Push \(1\)/).closest('button');
      await user.click(pushButton!);

      expect(chromeMocks.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'PUSH_TO_GITHUB',
      });
    });

    it('should show confirmation dialog when Push is clicked with no changes', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(No changes\)/)).toBeInTheDocument();
      });

      const pushButton = screen.getByText(/Push \(No changes\)/).closest('button');
      await user.click(pushButton!);

      await waitFor(() => {
        expect(screen.getByText('No Changes Detected')).toBeInTheDocument();
        expect(screen.getByText(/Do you still want to push to GitHub/)).toBeInTheDocument();
      });
    });

    it('should push to GitHub when confirmation is accepted', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(No changes\)/)).toBeInTheDocument();
      });

      const pushButton = screen.getByText(/Push \(No changes\)/).closest('button');
      await user.click(pushButton!);

      await waitFor(() => {
        expect(screen.getByText('Push Anyway')).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('Push Anyway').closest('button');
      await user.click(confirmButton!);

      await waitFor(() => {
        expect(chromeMocks.runtime.sendMessage).toHaveBeenCalledWith({
          action: 'PUSH_TO_GITHUB',
        });
      });
    });

    it('should not push when confirmation is cancelled', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(No changes\)/)).toBeInTheDocument();
      });

      const pushButton = screen.getByText(/Push \(No changes\)/).closest('button');
      await user.click(pushButton!);

      await waitFor(() => {
        expect(screen.getByText('No Changes Detected')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(chromeMocks.runtime.sendMessage).not.toHaveBeenCalledWith({
        action: 'PUSH_TO_GITHUB',
      });
    });

    it('should handle Push via keyboard Enter key', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Push \(1\)/)).toBeInTheDocument();
      });

      const pushButton = screen.getByText(/Push \(1\)/).closest('button');
      pushButton?.focus();
      await user.keyboard('{Enter}');

      expect(chromeMocks.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'PUSH_TO_GITHUB',
      });
    });
  });

  describe('Refresh File Changes', () => {
    it('should send REFRESH_FILE_CHANGES message to active tab', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      await waitFor(() => {
        expect(chromeMocks.tabs.query).toHaveBeenCalledWith({
          active: true,
          currentWindow: true,
        });
        expect(chromeMocks.tabs.sendMessage).toHaveBeenCalledWith(123, {
          action: 'REFRESH_FILE_CHANGES',
        });
      });
    });

    it('should show refreshing state while refresh is in progress', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.sendMessage.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should prevent multiple concurrent refreshes', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.sendMessage.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);
      await user.click(refreshButton!);
      await user.click(refreshButton!);

      expect(chromeMocks.tabs.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should display error when refresh fails', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.sendMessage.mockRejectedValue(new Error('Network error'));

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      await waitFor(() => {
        expect(screen.getByText(/Refresh failed: Network error/)).toBeInTheDocument();
      });
    });

    it('should display error when refresh returns unsuccessful response', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.sendMessage.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
      });

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      await waitFor(() => {
        expect(screen.getByText(/Refresh failed: Rate limit exceeded/)).toBeInTheDocument();
      });
    });

    it('should display error when no active tab is found', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      chromeMocks.tabs.query.mockResolvedValue([]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      await user.click(refreshButton!);

      await waitFor(() => {
        expect(screen.getByText(/Refresh failed: No active tab found/)).toBeInTheDocument();
      });
    });

    it('should handle refresh via keyboard Enter key', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh').closest('button');
      refreshButton?.focus();
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(chromeMocks.tabs.sendMessage).toHaveBeenCalledWith(123, {
          action: 'REFRESH_FILE_CHANGES',
        });
      });
    });
  });

  describe('Close Modal', () => {
    it('should close modal when Close button is clicked', async () => {
      const user = userEvent.setup();
      const fileChanges = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
      ]);

      render(FileChangesModal, {
        props: {
          show: true,
          fileChanges,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Close')).toBeInTheDocument();
      });

      const closeButton = screen.getByText('Close').closest('button');
      await user.click(closeButton!);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'File Changes' })).not.toBeInTheDocument();
      });
    });
  });
});
