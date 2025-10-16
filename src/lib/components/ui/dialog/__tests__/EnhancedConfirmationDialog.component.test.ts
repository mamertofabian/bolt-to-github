/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import EnhancedConfirmationDialog from '../EnhancedConfirmationDialog.svelte';

vi.unmock('$lib/components/ui/dialog/EnhancedConfirmationDialog.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/ui/input');
vi.unmock('$lib/components/ui/input/index.ts');
vi.unmock('$lib/components/ui/input/input.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('EnhancedConfirmationDialog Component Tests', () => {
  const defaultProps = {
    show: true,
    title: 'Test Dialog',
    message: 'Test message',
    confirmText: 'Push to GitHub',
    cancelText: 'Cancel',
    commitMessage: '',
    placeholder: 'Commit from Bolt to GitHub',
    showFilePreview: false,
    fileChangesSummary: null,
    commitMessageTemplates: [],
    isLoading: false,
    repoInfo: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Visibility', () => {
    it('should show dialog when show prop is true', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    });

    it('should hide dialog when show prop is false', () => {
      render(EnhancedConfirmationDialog, { props: { ...defaultProps, show: false } });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('Test Dialog')).not.toBeInTheDocument();
    });
  });

  describe('Dialog Content', () => {
    it('should display title and message', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should display custom title and message', async () => {
      const customProps = {
        ...defaultProps,
        title: 'Custom Title',
        message: 'Custom message content',
      };

      render(EnhancedConfirmationDialog, { props: customProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.getByText('Custom message content')).toBeInTheDocument();
    });

    it('should display repository information when provided', async () => {
      const repoProps = {
        ...defaultProps,
        repoInfo: { repoName: 'test-repo', branch: 'main' },
      };

      render(EnhancedConfirmationDialog, { props: repoProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText(/Repository:/)).toBeInTheDocument();
      expect(screen.getByText('test-repo / main')).toBeInTheDocument();
    });
  });

  describe('File Changes Summary', () => {
    it('should display file changes when showFilePreview is true', async () => {
      const fileProps = {
        ...defaultProps,
        showFilePreview: true,
        fileChangesSummary: { added: 5, modified: 3, deleted: 1 },
      };

      render(EnhancedConfirmationDialog, { props: fileProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Changes Summary')).toBeInTheDocument();
      expect(screen.getByText('+5 added')).toBeInTheDocument();
      expect(screen.getByText('~3 modified')).toBeInTheDocument();
      expect(screen.getByText('-1 deleted')).toBeInTheDocument();
    });

    it('should not display file changes when showFilePreview is false', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.queryByText('Changes Summary')).not.toBeInTheDocument();
    });
  });

  describe('Commit Message Input', () => {
    it('should have commit message input field', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('placeholder', 'Commit from Bolt to GitHub');
    });

    it('should allow typing in commit message input', async () => {
      const user = userEvent.setup();
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      await user.type(input, 'Custom commit message');
      expect(input).toHaveValue('Custom commit message');
    });

    it('should use custom placeholder text', async () => {
      const customProps = {
        ...defaultProps,
        placeholder: 'Custom placeholder text',
      };

      render(EnhancedConfirmationDialog, { props: customProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      expect(input).toHaveAttribute('placeholder', 'Custom placeholder text');
    });

    it('should show character counter when typing', async () => {
      const user = userEvent.setup();
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      await user.type(input, 'Test message');

      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  describe('Template Selection', () => {
    it('should show template toggle when templates are provided', async () => {
      const templateProps = {
        ...defaultProps,
        commitMessageTemplates: ['feat: add feature', 'fix: bug fix'],
      };

      render(EnhancedConfirmationDialog, { props: templateProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /show templates/i })).toBeInTheDocument();
    });

    it('should not show template toggle when no templates provided', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /show templates/i })).not.toBeInTheDocument();
    });

    it('should toggle templates visibility when toggle button is clicked', async () => {
      const user = userEvent.setup();
      const templateProps = {
        ...defaultProps,
        commitMessageTemplates: ['feat: add feature', 'fix: bug fix'],
      };

      render(EnhancedConfirmationDialog, { props: templateProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const toggleButton = screen.getByRole('button', { name: /show templates/i });
      await user.click(toggleButton);

      expect(screen.getByText('Quick Templates')).toBeInTheDocument();
      expect(screen.getByText('feat: add feature')).toBeInTheDocument();
      expect(screen.getByText('fix: bug fix')).toBeInTheDocument();
    });

    it('should select template when template button is clicked', async () => {
      const user = userEvent.setup();
      const templateProps = {
        ...defaultProps,
        commitMessageTemplates: ['feat: add feature', 'fix: bug fix'],
      };

      render(EnhancedConfirmationDialog, { props: templateProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const toggleButton = screen.getByRole('button', { name: /show templates/i });
      await user.click(toggleButton);

      const templateButton = screen.getByRole('button', { name: 'feat: add feature' });
      await user.click(templateButton);

      const input = screen.getByLabelText(/commit message/i);
      expect(input).toHaveValue('feat: add feature');
    });
  });

  describe('Action Buttons', () => {
    it('should display confirm and cancel buttons', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /push to github/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should display custom button text', async () => {
      const customProps = {
        ...defaultProps,
        confirmText: 'Custom Confirm',
        cancelText: 'Custom Cancel',
      };

      render(EnhancedConfirmationDialog, { props: customProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /custom confirm/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /custom cancel/i })).toBeInTheDocument();
    });

    it('should disable buttons when loading', async () => {
      const loadingProps = {
        ...defaultProps,
        isLoading: true,
      };

      render(EnhancedConfirmationDialog, { props: loadingProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /pushing/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('should show loading state in confirm button when loading', async () => {
      const loadingProps = {
        ...defaultProps,
        isLoading: true,
      };

      render(EnhancedConfirmationDialog, { props: loadingProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Pushing...')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should emit confirm event when confirm button is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(EnhancedConfirmationDialog, { props: defaultProps });

      const confirmHandler = vi.fn();
      component.$on('confirm', confirmHandler);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /push to github/i });
      await user.click(confirmButton);

      expect(confirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            commitMessage: 'Commit from Bolt to GitHub',
          },
        })
      );
    });

    it('should emit cancel event when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(EnhancedConfirmationDialog, { props: defaultProps });

      const cancelHandler = vi.fn();
      component.$on('cancel', cancelHandler);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(cancelHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cancel',
        })
      );
    });

    it('should emit cancel event when close button is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(EnhancedConfirmationDialog, { props: defaultProps });

      const cancelHandler = vi.fn();
      component.$on('cancel', cancelHandler);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /close dialog/i });
      await user.click(closeButton);

      expect(cancelHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cancel',
        })
      );
    });

    it('should not emit events when loading', async () => {
      const user = userEvent.setup();
      const { component } = render(EnhancedConfirmationDialog, {
        props: { ...defaultProps, isLoading: true },
      });

      const confirmHandler = vi.fn();
      const cancelHandler = vi.fn();
      component.$on('confirm', confirmHandler);
      component.$on('cancel', cancelHandler);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /pushing/i });
      const cancelButton = screen.getByRole('button', { name: /cancel/i });

      await user.click(confirmButton);
      await user.click(cancelButton);

      expect(confirmHandler).not.toHaveBeenCalled();
      expect(cancelHandler).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle Enter key in input to confirm', async () => {
      const user = userEvent.setup();
      const { component } = render(EnhancedConfirmationDialog, { props: defaultProps });

      const confirmHandler = vi.fn();
      component.$on('confirm', confirmHandler);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      await user.type(input, 'Test commit');
      await user.keyboard('{Enter}');

      expect(confirmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            commitMessage: 'Test commit',
          },
        })
      );
    });

    it('should handle Escape key to cancel', async () => {
      const user = userEvent.setup();
      const { component } = render(EnhancedConfirmationDialog, { props: defaultProps });

      const cancelHandler = vi.fn();
      component.$on('cancel', cancelHandler);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      await user.click(input);
      await user.keyboard('{Escape}');

      expect(cancelHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cancel',
        })
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'dialog-description');
    });

    it('should have proper form labels', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const input = screen.getByLabelText(/commit message/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('id', 'commit-message-input');
    });

    it('should have accessible close button', async () => {
      render(EnhancedConfirmationDialog, { props: defaultProps });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /close dialog/i });
      expect(closeButton).toBeInTheDocument();
    });
  });
});
