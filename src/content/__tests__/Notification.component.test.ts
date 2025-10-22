/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Notification from '../Notification.svelte';

vi.unmock('../Notification.svelte');
vi.unmock('../../content/Notification.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');
vi.unmock('svelte');
vi.unmock('svelte/transition');
vi.unmock('svelte/internal');

vi.mock('$lib/utils/reassuringMessages', () => ({
  getContextualMessage: vi.fn(() => 'Processing your files...'),
  getRotatingMessage: vi.fn(() => 'This usually takes a few moments'),
  resetMessageRotation: vi.fn(),
}));

describe('Notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render notification with info type by default', () => {
      render(Notification, {
        props: {
          message: 'Test notification',
          onClose: vi.fn(),
        },
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Test notification')).toBeInTheDocument();
    });

    it('should render notification with custom type', () => {
      render(Notification, {
        props: {
          type: 'success',
          message: 'Success message',
          onClose: vi.fn(),
        },
      });

      expect(screen.getByText('Success message')).toBeInTheDocument();
    });

    it('should render notification with error type', () => {
      render(Notification, {
        props: {
          type: 'error',
          message: 'Error occurred',
          onClose: vi.fn(),
        },
      });

      expect(screen.getByText('Error occurred')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'Test',
          onClose,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      await user.click(closeButton);

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should close on Escape key', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'Test',
          onClose,
        },
      });

      await user.keyboard('{Escape}');

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should render action buttons when provided', () => {
      const mockAction = vi.fn();
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
          actions: [
            { text: 'Action 1', action: mockAction, variant: 'primary' },
            { text: 'Action 2', action: vi.fn(), variant: 'secondary' },
          ],
        },
      });

      expect(screen.getByRole('button', { name: 'Action 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action 2' })).toBeInTheDocument();
    });

    it('should execute action when button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const mockAction = vi.fn();
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
          actions: [{ text: 'Click Me', action: mockAction }],
        },
      });

      const actionButton = screen.getByRole('button', { name: 'Click Me' });
      await user.click(actionButton);

      expect(mockAction).toHaveBeenCalled();
    });

    it('should not execute disabled actions', async () => {
      const user = userEvent.setup({ delay: null });
      const mockAction = vi.fn();
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
          actions: [{ text: 'Disabled', action: mockAction, disabled: true }],
        },
      });

      const actionButton = screen.getByRole('button', { name: 'Disabled' });
      expect(actionButton).toBeDisabled();

      await user.click(actionButton);

      expect(mockAction).not.toHaveBeenCalled();
    });

    it('should handle async actions', async () => {
      const user = userEvent.setup({ delay: null });
      const asyncAction = vi.fn().mockResolvedValue(undefined);
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
          actions: [{ text: 'Async Action', action: asyncAction }],
        },
      });

      const actionButton = screen.getByRole('button', { name: 'Async Action' });
      await user.click(actionButton);

      await waitFor(() => {
        expect(asyncAction).toHaveBeenCalled();
      });
    });
  });

  describe('Progress Display', () => {
    it('should render progress bar when progress prop is provided', () => {
      render(Notification, {
        props: {
          message: 'Uploading...',
          onClose: vi.fn(),
          progress: 50,
          operation: 'uploading',
        },
      });

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should update progress bar when progress changes', async () => {
      const { rerender } = render(Notification, {
        props: {
          message: 'Uploading...',
          onClose: vi.fn(),
          progress: 0,
          operation: 'uploading',
        },
      });

      expect(screen.getByText('0%')).toBeInTheDocument();

      await rerender({
        message: 'Uploading...',
        onClose: vi.fn(),
        progress: 75,
        operation: 'uploading',
      });

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should not render progress bar when progress is null', () => {
      render(Notification, {
        props: {
          message: 'Simple notification',
          onClose: vi.fn(),
          progress: null,
        },
      });

      expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    });
  });

  describe('Reassuring Messages', () => {
    it('should render operation notifications with progress', () => {
      render(Notification, {
        props: {
          message: 'Uploading...',
          onClose: vi.fn(),
          progress: 50,
          operation: 'uploading',
        },
      });

      expect(screen.getByText('Uploading...')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should render simple notifications without progress', () => {
      render(Notification, {
        props: {
          type: 'success',
          message: 'Upload complete!',
          onClose: vi.fn(),
        },
      });

      expect(screen.getByText('Upload complete!')).toBeInTheDocument();
      expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    });
  });

  describe('Auto-close Behavior', () => {
    it('should not auto-close reminder notifications', async () => {
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'You have unsaved changes',
          onClose,
          duration: 2000,
        },
      });

      vi.advanceTimersByTime(5000);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should pause auto-hide on mouse enter', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'Test pause',
          onClose,
          duration: 2000,
        },
      });

      const alert = screen.getByRole('alert');

      vi.advanceTimersByTime(1000);

      await user.hover(alert);

      vi.advanceTimersByTime(2000);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should resume auto-hide on mouse leave', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'Test resume',
          onClose,
          duration: 2000,
        },
      });

      const alert = screen.getByRole('alert');

      vi.advanceTimersByTime(1000);

      await user.hover(alert);
      await user.unhover(alert);

      vi.advanceTimersByTime(1500);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(Notification, {
        props: {
          message: 'Test notification',
          onClose: vi.fn(),
        },
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
      expect(alert).toHaveAttribute('aria-atomic', 'true');
    });

    it('should have accessible close button', () => {
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close notification');
    });

    it('should have accessible action buttons', () => {
      render(Notification, {
        props: {
          message: 'Test',
          onClose: vi.fn(),
          actions: [
            { text: 'Action 1', action: vi.fn() },
            { text: 'Action 2', action: vi.fn() },
          ],
        },
      });

      const action1 = screen.getByRole('button', { name: 'Action 1' });
      const action2 = screen.getByRole('button', { name: 'Action 2' });

      expect(action1).toHaveAttribute('aria-label', 'Action 1');
      expect(action2).toHaveAttribute('aria-label', 'Action 2');
    });
  });

  describe('Component Behavior', () => {
    it('should render with duration prop', () => {
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'Will auto-hide',
          onClose,
          duration: 5000,
        },
      });

      expect(screen.getByText('Will auto-hide')).toBeInTheDocument();
    });

    it('should render with custom duration', () => {
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'Custom duration',
          onClose,
          duration: 3000,
        },
      });

      expect(screen.getByText('Custom duration')).toBeInTheDocument();
    });

    it('should close immediately for reminder notifications', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      render(Notification, {
        props: {
          message: 'You have unsaved changes',
          onClose,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      await user.click(closeButton);

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should auto-close notification after action completes', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      const mockAction = vi.fn();
      render(Notification, {
        props: {
          message: 'Test',
          onClose,
          duration: 2000,
          actions: [{ text: 'Action', action: mockAction }],
        },
      });

      const actionButton = screen.getByRole('button', { name: 'Action' });
      await user.click(actionButton);

      vi.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});
