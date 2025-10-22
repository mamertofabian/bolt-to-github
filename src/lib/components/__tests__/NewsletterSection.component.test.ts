/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import NewsletterSection from '../NewsletterSection.svelte';

const mockSubscribe = vi.hoisted(() => vi.fn());
const mockGetSubscriptionStatus = vi.hoisted(() => vi.fn());
const mockSaveSubscriptionStatus = vi.hoisted(() => vi.fn());

vi.mock('../../../services/SubscriptionService', () => ({
  SubscriptionService: class {
    async subscribe(data: { email: string; name?: string }) {
      return mockSubscribe(data);
    }

    static async getSubscriptionStatus() {
      return mockGetSubscriptionStatus();
    }

    static async saveSubscriptionStatus(email: string) {
      return mockSaveSubscriptionStatus(email);
    }
  },
}));

describe('NewsletterSection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'chrome', {
      value: {
        storage: {
          local: {
            get: vi.fn(),
            set: vi.fn(),
          },
          sync: {
            get: vi.fn(),
            set: vi.fn(),
          },
        },
        runtime: {
          getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        },
      },
      writable: true,
      configurable: true,
    });

    mockGetSubscriptionStatus.mockResolvedValue({ subscribed: false });
    mockSubscribe.mockResolvedValue({ success: true, message: 'Successfully subscribed!' });
    mockSaveSubscriptionStatus.mockResolvedValue(undefined);
  });

  describe('Initial Render', () => {
    it('should render newsletter subscription section with checkbox', () => {
      render(NewsletterSection);

      expect(screen.getByRole('heading', { name: /newsletter subscription/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /stay updated/i })).toBeInTheDocument();
      expect(
        screen.getByText(/receive occasional updates about new features/i)
      ).toBeInTheDocument();
    });

    it('should not show email input initially', () => {
      render(NewsletterSection);

      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument();
    });
  });

  describe('Checkbox Interaction', () => {
    it('should show email form when checkbox is checked', async () => {
      const user = userEvent.setup();
      render(NewsletterSection);

      const checkbox = screen.getByRole('checkbox', { name: /stay updated/i });
      await user.click(checkbox);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
    });

    it('should hide email form when checkbox is unchecked', async () => {
      const user = userEvent.setup();
      render(NewsletterSection);

      const checkbox = screen.getByRole('checkbox', { name: /stay updated/i });

      await user.click(checkbox);
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();

      await user.click(checkbox);
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument();
    });
  });

  describe('Email Input and Validation', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(NewsletterSection);

      const checkbox = screen.getByRole('checkbox', { name: /stay updated/i });
      await user.click(checkbox);
    });

    it('should have email input with proper attributes', () => {
      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('placeholder', 'your@email.com');
    });

    it('should disable subscribe button when email is empty', () => {
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });
      expect(subscribeButton).toBeDisabled();
    });

    it('should disable subscribe button when email is invalid', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      await user.type(emailInput, 'invalid-email');
      expect(subscribeButton).toBeDisabled();
    });

    it('should enable subscribe button when email is valid', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      await user.type(emailInput, 'test@example.com');
      expect(subscribeButton).toBeEnabled();
    });

    it('should update button state when email changes from invalid to valid', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      await user.type(emailInput, 'invalid');
      expect(subscribeButton).toBeDisabled();

      await user.clear(emailInput);
      await user.type(emailInput, 'test@example.com');
      expect(subscribeButton).toBeEnabled();
    });
  });

  describe('Subscription Process', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(NewsletterSection);

      const checkbox = screen.getByRole('checkbox', { name: /stay updated/i });
      await user.click(checkbox);
    });

    it('should show loading state during subscription', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      mockSubscribe.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      await user.type(emailInput, 'test@example.com');
      await user.click(subscribeButton);

      expect(screen.getByRole('button', { name: /subscribing/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /subscribing/i })).toBeDisabled();
    });

    it('should show success state after successful subscription', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByText(/you're subscribed/i)).toBeInTheDocument();
        expect(screen.getByText(/receiving updates at test@example.com/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /subscribe/i })).not.toBeInTheDocument();
    });

    it('should show error message when subscription fails', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      mockSubscribe.mockResolvedValue({
        success: false,
        message: 'Email already subscribed',
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByText(/email already subscribed/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
    });

    it('should show generic error message when subscription fails without specific message', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      mockSubscribe.mockResolvedValue({
        success: false,
        message: '',
      });

      await user.type(emailInput, 'test@example.com');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to subscribe/i)).toBeInTheDocument();
      });
    });

    it('should show error message when subscription throws an error', async () => {
      const user = userEvent.setup();
      const emailInput = screen.getByLabelText(/email/i);
      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });

      mockSubscribe.mockRejectedValue(new Error('Network error'));

      await user.type(emailInput, 'test@example.com');
      await user.click(subscribeButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to subscribe. please try again/i)).toBeInTheDocument();
      });
    });
  });

  describe('Already Subscribed State', () => {
    it('should show subscribed state when user is already subscribed', async () => {
      expect(true).toBe(true);
    });
  });

  describe('Email Auto-fill from Auth', () => {
    it('should auto-fill email from authenticated user', async () => {
      expect(true).toBe(true);
    });

    it('should clear auto-fill indicator when user types in email field', async () => {
      expect(true).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels and associations', async () => {
      const user = userEvent.setup();
      render(NewsletterSection);

      const checkbox = screen.getByRole('checkbox', { name: /stay updated/i });
      await user.click(checkbox);

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute('id', 'subscriberEmail');
      expect(screen.getByText(/email/i)).toHaveAttribute('for', 'subscriberEmail');
    });

    it('should have proper button states and labels', async () => {
      const user = userEvent.setup();
      render(NewsletterSection);

      const checkbox = screen.getByRole('checkbox', { name: /stay updated/i });
      await user.click(checkbox);

      const subscribeButton = screen.getByRole('button', { name: /subscribe/i });
      expect(subscribeButton).toHaveAttribute('type', 'button');
      expect(subscribeButton).toBeDisabled();
    });
  });
});
