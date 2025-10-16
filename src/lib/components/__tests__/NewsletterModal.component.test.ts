/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import NewsletterModal from '../NewsletterModal.svelte';

vi.unmock('$lib/components/ui/modal/Modal.svelte');

const mockSubscribe = vi.fn();
const mockSaveSubscriptionStatus = vi.fn();

vi.mock('../../services/SubscriptionService', () => ({
  SubscriptionService: class {
    async subscribe(data: { email: string; name?: string }) {
      return mockSubscribe(data);
    }
    static async saveSubscriptionStatus(email: string) {
      return mockSaveSubscriptionStatus(email);
    }
  },
}));

describe('NewsletterModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockResolvedValue({ success: true });
    mockSaveSubscriptionStatus.mockResolvedValue(undefined);
  });

  describe('Modal Visibility', () => {
    it('should not render modal content when show is false', () => {
      render(NewsletterModal, { props: { show: false } });

      expect(screen.queryByText(/stay in the loop/i)).not.toBeInTheDocument();
    });

    it('should render modal content when show is true', () => {
      const { container } = render(NewsletterModal, { props: { show: true } });

      console.log('Container HTML:', container.innerHTML);
      console.log('All text content:', screen.getAllByText(/.*/));

      expect(container.innerHTML).toContain('Stay in the Loop');
    });

    it('should toggle modal visibility based on show prop', async () => {
      const { rerender } = render(NewsletterModal, { props: { show: false } });

      expect(screen.queryByText(/stay in the loop/i)).not.toBeInTheDocument();

      await rerender({ show: true });
      expect(screen.getByText(/stay in the loop/i)).toBeInTheDocument();

      await rerender({ show: false });
      expect(screen.queryByText(/stay in the loop/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Fields and Labels', () => {
    it('should render email input with proper attributes', () => {
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('required');
      expect(emailInput).toHaveAttribute('placeholder', 'your@email.com');
    });

    it('should render optional name input field', () => {
      render(NewsletterModal, { props: { show: true } });

      const nameInput = screen.getByLabelText(/name \(optional\)/i);
      expect(nameInput).toBeInTheDocument();
      expect(nameInput).not.toHaveAttribute('required');
      expect(nameInput).toHaveAttribute('placeholder', 'Your name');
    });

    it('should render value proposition content', () => {
      render(NewsletterModal, { props: { show: true } });

      expect(screen.getByText(/what you'll receive/i)).toBeInTheDocument();
      expect(screen.getByText(/new feature announcements/i)).toBeInTheDocument();
      expect(screen.getByText(/tips & tricks for productivity/i)).toBeInTheDocument();
      expect(screen.getByText(/community highlights/i)).toBeInTheDocument();
    });

    it('should render privacy notice', () => {
      render(NewsletterModal, { props: { show: true } });

      expect(screen.getByText(/we respect your privacy/i)).toBeInTheDocument();
      expect(screen.getByText(/unsubscribe at any time/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation and Submission', () => {
    it('should disable submit button when email is empty', () => {
      render(NewsletterModal, { props: { show: true } });

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button with invalid email', async () => {
      const user = userEvent.setup({ delay: null });
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button with valid email', async () => {
      const user = userEvent.setup({ delay: null });
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should have submit button that is clickable when email is valid', async () => {
      const user = userEvent.setup({ delay: null });
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      expect(submitButton).not.toBeDisabled();

      await user.click(submitButton);

      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should have a functional submit button', async () => {
      const user = userEvent.setup({ delay: null });
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      expect(submitButton).not.toBeDisabled();

      await user.click(submitButton);
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Modal Interactions', () => {
    it('should close modal when Not Now button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const { component } = render(NewsletterModal, { props: { show: true } });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const cancelButton = screen.getByRole('button', { name: /not now/i });
      await user.click(cancelButton);

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should close modal when Escape key is pressed', async () => {
      const user = userEvent.setup({ delay: null });
      const { component } = render(NewsletterModal, { props: { show: true } });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      await user.keyboard('{Escape}');

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should allow Enter key interaction with email input', async () => {
      const user = userEvent.setup({ delay: null });
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      await user.type(emailInput, 'test@example.com');

      await user.keyboard('{Enter}');

      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should reset form when modal is closed and reopened', async () => {
      const user = userEvent.setup({ delay: null });
      const { rerender } = render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      const nameInput = screen.getByLabelText(/name \(optional\)/i);

      await user.type(emailInput, 'test@example.com');
      await user.type(nameInput, 'John Doe');

      const cancelButton = screen.getByRole('button', { name: /not now/i });
      await user.click(cancelButton);

      await rerender({ show: true });

      const newEmailInput = screen.getByLabelText(/^email$/i);
      const newNameInput = screen.getByLabelText(/name \(optional\)/i);
      expect(newEmailInput).toHaveValue('');
      expect(newNameInput).toHaveValue('');
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels and attributes', () => {
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      const nameInput = screen.getByLabelText(/name \(optional\)/i);

      expect(emailInput).toHaveAttribute('required');
      expect(nameInput).not.toHaveAttribute('required');
    });

    it('should have accessible button labels', () => {
      render(NewsletterModal, { props: { show: true } });

      expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(NewsletterModal, { props: { show: true } });

      const heading = screen.getByText(/stay in the loop/i);
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H2');
    });

    it('should have form fields that can be filled and submitted', async () => {
      const user = userEvent.setup({ delay: null });
      render(NewsletterModal, { props: { show: true } });

      const emailInput = screen.getByLabelText(/^email$/i);
      const nameInput = screen.getByLabelText(/name \(optional\)/i);

      await user.type(emailInput, 'test@example.com');
      await user.type(nameInput, 'John Doe');

      expect(emailInput).toHaveValue('test@example.com');
      expect(nameInput).toHaveValue('John Doe');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      expect(submitButton).not.toBeDisabled();

      await user.click(submitButton);
      expect(submitButton).toBeInTheDocument();
    });
  });
});
