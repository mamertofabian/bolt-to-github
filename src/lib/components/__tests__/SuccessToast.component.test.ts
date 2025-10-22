/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SuccessToast from '../SuccessToast.svelte';

describe('SuccessToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should display success message when shown', () => {
      render(SuccessToast, {
        props: {
          message: 'Operation successful!',
          show: true,
        },
      });

      expect(screen.getByText('Operation successful!')).toBeInTheDocument();
    });

    it('should not display toast when hidden', () => {
      render(SuccessToast, {
        props: {
          message: 'Operation successful!',
          show: false,
        },
      });

      expect(screen.queryByText('Operation successful!')).not.toBeInTheDocument();
    });

    it('should display custom success message', () => {
      const customMessage = 'Custom success message here';
      render(SuccessToast, {
        props: {
          message: customMessage,
          show: true,
        },
      });

      expect(screen.getByText(customMessage)).toBeInTheDocument();
    });

    it('should show success indicator', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
        },
      });

      expect(screen.getByText('Success!')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /close notification/i })).toBeInTheDocument();
    });
  });

  describe('Subscribe Prompt', () => {
    it('should show subscribe prompt when enabled and user not subscribed', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: false,
        },
      });

      expect(screen.getByText(/want to stay updated/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('should not show subscribe prompt when user already subscribed', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: true,
        },
      });

      expect(screen.queryByText(/want to stay updated/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument();
    });

    it('should not show subscribe prompt when disabled', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: false,
          hasSubscribed: false,
        },
      });

      expect(screen.queryByText(/want to stay updated/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument();
    });

    it('should emit subscribe event when Subscribe button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const { component } = render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: false,
        },
      });

      const subscribeHandler = vi.fn();
      component.$on('subscribe', subscribeHandler);

      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(subscribeButton);

      expect(subscribeHandler).toHaveBeenCalled();
    });

    it('should hide toast when Subscribe button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: false,
        },
      });

      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.queryByText('Success!')).not.toBeInTheDocument();
      });
    });

    it('should emit hide event when Dismiss button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const { component } = render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: false,
        },
      });

      const hideHandler = vi.fn();
      component.$on('hide', hideHandler);

      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      await user.click(dismissButton);

      expect(hideHandler).toHaveBeenCalled();
    });
  });

  describe('Close Button', () => {
    it('should show close button when subscribe prompt is not shown', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: false,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('should show close button when user is already subscribed', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: true,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('should emit hide event when close button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const { component } = render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
        },
      });

      const hideHandler = vi.fn();
      component.$on('hide', hideHandler);

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      await user.click(closeButton);

      expect(hideHandler).toHaveBeenCalled();
    });

    it('should hide toast when close button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Success!')).not.toBeInTheDocument();
      });
    });
  });

  describe('Auto-hide Behavior', () => {
    it('should emit hide event after default duration', async () => {
      const { component } = render(SuccessToast, {
        props: {
          message: 'Will auto-hide',
          show: true,
        },
      });

      const hideHandler = vi.fn();
      component.$on('hide', hideHandler);

      expect(screen.getByText('Will auto-hide')).toBeInTheDocument();

      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(hideHandler).toHaveBeenCalled();
      });
    });

    it('should emit hide event after custom duration', async () => {
      const { component } = render(SuccessToast, {
        props: {
          message: 'Custom duration',
          show: true,
          duration: 3000,
        },
      });

      const hideHandler = vi.fn();
      component.$on('hide', hideHandler);

      vi.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(hideHandler).toHaveBeenCalled();
      });
    });

    it('should update message when props change', async () => {
      const { rerender } = render(SuccessToast, {
        props: {
          message: 'First message',
          show: true,
        },
      });

      expect(screen.getByText('First message')).toBeInTheDocument();

      await rerender({
        message: 'Updated message',
        show: true,
      });

      expect(screen.getByText('Updated message')).toBeInTheDocument();
      expect(screen.queryByText('First message')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label for close button', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close notification');
    });

    it('should have accessible subscribe button', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: false,
        },
      });

      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });
      expect(subscribeButton).toBeInTheDocument();
    });

    it('should have accessible dismiss button', () => {
      render(SuccessToast, {
        props: {
          message: 'Success!',
          show: true,
          showSubscribePrompt: true,
          hasSubscribed: false,
        },
      });

      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      expect(dismissButton).toBeInTheDocument();
    });
  });
});
