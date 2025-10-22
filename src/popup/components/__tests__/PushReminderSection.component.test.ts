/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PushReminderSection from '../PushReminderSection.svelte';

describe('PushReminderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render the main heading', () => {
      render(PushReminderSection);

      expect(screen.getByRole('heading', { name: /push reminders/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /push reminders/i })).toHaveTextContent(
        'Push Reminders'
      );
    });

    it('should display the PRO badge', () => {
      render(PushReminderSection);

      const proBadge = screen.getByText('PRO');
      expect(proBadge).toBeInTheDocument();
    });

    it('should display the description text', () => {
      render(PushReminderSection);

      expect(
        screen.getByText(
          /get intelligent reminders to push your changes when you're idle or on schedule/i
        )
      ).toBeInTheDocument();
    });

    it('should display all four feature items', () => {
      render(PushReminderSection);

      expect(screen.getByText('Smart activity detection')).toBeInTheDocument();
      expect(screen.getByText('Scheduled reminders')).toBeInTheDocument();
      expect(screen.getByText('Customizable intervals')).toBeInTheDocument();
      expect(screen.getByText('Snooze options')).toBeInTheDocument();
    });

    it('should render the configure button', () => {
      render(PushReminderSection);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });
      expect(configureButton).toBeInTheDocument();
      expect(configureButton).toHaveTextContent('Configure Push Reminders');
    });
  });

  describe('User Interactions', () => {
    it('should dispatch configure event when button is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(PushReminderSection);

      const configureHandler = vi.fn();
      component.$on('configure', configureHandler);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });
      await user.click(configureButton);

      expect(configureHandler).toHaveBeenCalledTimes(1);
    });

    it('should support keyboard interaction with Enter key', async () => {
      const user = userEvent.setup();
      const { component } = render(PushReminderSection);

      const configureHandler = vi.fn();
      component.$on('configure', configureHandler);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });

      configureButton.focus();
      await user.keyboard('{Enter}');

      expect(configureHandler).toHaveBeenCalledTimes(1);
    });

    it('should support keyboard interaction with Space key', async () => {
      const user = userEvent.setup();
      const { component } = render(PushReminderSection);

      const configureHandler = vi.fn();
      component.$on('configure', configureHandler);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });

      configureButton.focus();
      await user.keyboard(' ');

      expect(configureHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple rapid clicks', async () => {
      const user = userEvent.setup();
      const { component } = render(PushReminderSection);

      const configureHandler = vi.fn();
      component.$on('configure', configureHandler);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });

      await user.click(configureButton);
      await user.click(configureButton);
      await user.click(configureButton);

      expect(configureHandler).toHaveBeenCalledTimes(3);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(PushReminderSection);

      const heading = screen.getByRole('heading', { name: /push reminders/i });
      expect(heading.tagName).toBe('H3');
    });

    it('should have accessible button with proper role', () => {
      render(PushReminderSection);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });
      expect(configureButton).toHaveAttribute('type', 'button');
    });

    it('should be enabled by default', () => {
      render(PushReminderSection);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });
      expect(configureButton).not.toBeDisabled();
    });

    it('should maintain focus management during interactions', async () => {
      const user = userEvent.setup();
      render(PushReminderSection);

      const configureButton = screen.getByRole('button', { name: /configure push reminders/i });

      configureButton.focus();
      expect(configureButton).toHaveFocus();

      await user.click(configureButton);

      expect(configureButton).not.toBeDisabled();
    });
  });

  describe('Component Structure', () => {
    it('should have proper semantic structure', () => {
      render(PushReminderSection);

      expect(screen.getByRole('heading', { name: /push reminders/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /configure push reminders/i })).toBeInTheDocument();
    });

    it('should render without any props', () => {
      expect(() => render(PushReminderSection)).not.toThrow();
    });
  });
});
