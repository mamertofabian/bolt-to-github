/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import StatusAlert from '../StatusAlert.svelte';

vi.unmock('$lib/components/ui/alert');
vi.unmock('$lib/components/ui/alert/index.ts');
vi.unmock('$lib/components/ui/alert/alert.svelte');
vi.unmock('$lib/components/ui/alert/alert-title.svelte');
vi.unmock('$lib/components/ui/alert/alert-description.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('StatusAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User Interface', () => {
    it('should display configuration warning message to users', () => {
      render(StatusAlert);

      expect(screen.getByText('Missing Configuration')).toBeInTheDocument();
      expect(screen.getByText('Click here to configure your GitHub settings')).toBeInTheDocument();
    });

    it('should be interactive and accessible to users', () => {
      render(StatusAlert);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      expect(alert).toBeInTheDocument();
      expect(alert).toBeEnabled();
    });

    it('should be keyboard accessible for users', () => {
      render(StatusAlert);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      expect(alert).toHaveAttribute('tabindex', '0');
    });
  });

  describe('User Interactions', () => {
    it('should allow users to click to configure settings', async () => {
      const user = userEvent.setup();
      const { component } = render(StatusAlert);

      const switchTabHandler = vi.fn();
      component.$on('switchTab', switchTabHandler);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      await user.click(alert);

      expect(switchTabHandler).toHaveBeenCalledTimes(1);
      expect(switchTabHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'settings',
        })
      );
    });

    it('should allow users to activate via keyboard', async () => {
      const user = userEvent.setup();
      const { component } = render(StatusAlert);

      const switchTabHandler = vi.fn();
      component.$on('switchTab', switchTabHandler);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      alert.focus();
      await user.keyboard('{Enter}');

      expect(switchTabHandler).toHaveBeenCalledTimes(1);
      expect(switchTabHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'settings',
        })
      );
    });

    it('should not respond to other keyboard inputs', async () => {
      const user = userEvent.setup();
      const { component } = render(StatusAlert);

      const switchTabHandler = vi.fn();
      component.$on('switchTab', switchTabHandler);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      alert.focus();
      await user.keyboard('{Space}');
      await user.keyboard('{Escape}');
      await user.keyboard('a');

      expect(switchTabHandler).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper semantic structure for screen readers', () => {
      render(StatusAlert);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      expect(alert).toBeInTheDocument();

      expect(screen.getByText('Missing Configuration')).toBeInTheDocument();
      expect(screen.getByText('Click here to configure your GitHub settings')).toBeInTheDocument();
    });

    it('should be focusable and navigable with keyboard', () => {
      render(StatusAlert);

      const alert = screen.getByRole('button', { name: /missing configuration/i });
      expect(alert).toHaveAttribute('tabindex', '0');
    });
  });
});
