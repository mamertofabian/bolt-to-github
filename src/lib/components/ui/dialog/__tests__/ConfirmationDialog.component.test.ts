/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ConfirmationDialog from '../ConfirmationDialog.svelte';

vi.unmock('$lib/components/ui/dialog/ConfirmationDialog.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('ConfirmationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Visibility', () => {
    it('should not be visible when show is false', () => {
      render(ConfirmationDialog, {
        props: {
          show: false,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
    });

    it('should be visible when show is true', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });
  });

  describe('Content Display', () => {
    it('should display title and message to user', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Delete Item',
          message: 'Are you sure you want to delete this item?',
        },
      });

      expect(screen.getByText('Delete Item')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument();
    });

    it('should display custom button text', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
          confirmText: 'Yes, Delete',
          cancelText: 'Keep It',
        },
      });

      expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
      expect(screen.getByText('Keep It')).toBeInTheDocument();
    });

    it('should use default button text when not provided', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Dialog Types', () => {
    it('should display appropriate icon for info type', () => {
      const { container } = render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Info Dialog',
          message: 'This is an info message',
          type: 'info',
        },
      });

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should display appropriate icon for warning type', () => {
      const { container } = render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Warning Dialog',
          message: 'This is a warning message',
          type: 'warning',
        },
      });

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should display appropriate icon for danger type', () => {
      const { container } = render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Danger Dialog',
          message: 'This is a danger message',
          type: 'danger',
        },
      });

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onConfirm when confirm button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnConfirm = vi.fn();

      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
          onConfirm: mockOnConfirm,
        },
      });

      await user.click(screen.getByText('Confirm'));

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnCancel = vi.fn();

      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
          onCancel: mockOnCancel,
        },
      });

      await user.click(screen.getByText('Cancel'));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Keyboard Interactions', () => {
    it('should call onCancel when Escape key is pressed', async () => {
      const user = userEvent.setup();
      const mockOnCancel = vi.fn();

      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
          onCancel: mockOnCancel,
        },
      });

      const dialogContainer = document.querySelector('[tabindex="-1"]') as HTMLElement;
      dialogContainer?.focus();

      await user.keyboard('{Escape}');

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onConfirm when Enter key is pressed', async () => {
      const user = userEvent.setup();
      const mockOnConfirm = vi.fn();

      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
          onConfirm: mockOnConfirm,
        },
      });

      const dialogContainer = document.querySelector('[tabindex="-1"]') as HTMLElement;
      dialogContainer?.focus();

      await user.keyboard('{Enter}');

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should have focusable buttons', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      const confirmButton = screen.getByText('Confirm');
      const cancelButton = screen.getByText('Cancel');

      expect(confirmButton).toBeInTheDocument();
      expect(cancelButton).toBeInTheDocument();
    });

    it('should be accessible via keyboard navigation', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      const dialogContainer = document.querySelector('[tabindex="-1"]');
      expect(dialogContainer).toHaveAttribute('tabindex', '-1');
    });
  });

  describe('Message Formatting', () => {
    it('should display multi-line message content', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Line 1\nLine 2\nLine 3',
        },
      });

      expect(screen.getByText(/Line 1.*Line 2.*Line 3/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message gracefully', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: '',
        },
      });

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should handle empty title gracefully', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: '',
          message: 'Test message',
        },
      });

      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should work with default empty functions', () => {
      render(ConfirmationDialog, {
        props: {
          show: true,
          title: 'Test Title',
          message: 'Test message',
        },
      });

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });
});
