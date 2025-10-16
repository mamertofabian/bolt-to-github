/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import WelcomeHero from '../WelcomeHero.svelte';

describe('WelcomeHero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render welcome heading', () => {
      render(WelcomeHero);

      expect(
        screen.getByRole('heading', { name: /welcome to bolt to github/i })
      ).toBeInTheDocument();
    });

    it('should render introduction text', () => {
      render(WelcomeHero);

      expect(
        screen.getByText(/to get started with bolt to github, we need to connect to github first/i)
      ).toBeInTheDocument();
    });

    it('should render GitHub App recommendation', () => {
      render(WelcomeHero);

      expect(screen.getByText('GitHub App Recommended')).toBeInTheDocument();
    });

    it('should render recommendation details', () => {
      render(WelcomeHero);

      expect(
        screen.getByText(/while it involves creating a bolt2github.com account/i)
      ).toBeInTheDocument();
    });

    it('should render reassurance text', () => {
      render(WelcomeHero);

      expect(
        screen.getByText(/don't worry - the setup process is guided and takes just a few clicks/i)
      ).toBeInTheDocument();
    });

    it('should render get started button', () => {
      render(WelcomeHero);

      expect(screen.getByRole('button', { name: /connect github account/i })).toBeInTheDocument();
    });
  });

  describe('User Interaction', () => {
    it('should be clickable and trigger start action', async () => {
      const user = userEvent.setup();
      const { component } = render(WelcomeHero);

      let startEventFired = false;
      component.$on('start', () => {
        startEventFired = true;
      });

      const button = screen.getByRole('button', { name: /connect github account/i });
      await user.click(button);

      expect(startEventFired).toBe(true);
    });

    it('should allow multiple clicks', async () => {
      const user = userEvent.setup();
      const { component } = render(WelcomeHero);

      let clickCount = 0;
      component.$on('start', () => {
        clickCount++;
      });

      const button = screen.getByRole('button', { name: /connect github account/i });
      await user.click(button);
      await user.click(button);

      expect(clickCount).toBe(2);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(WelcomeHero);

      const heading = screen.getByRole('heading', { name: /welcome to bolt to github/i });
      expect(heading).toBeInTheDocument();
    });

    it('should have accessible button with descriptive text', () => {
      render(WelcomeHero);

      const button = screen.getByRole('button', { name: /connect github account/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(/connect github account/i);
    });

    it('should have proper visual hierarchy with recommendation section', () => {
      render(WelcomeHero);

      const recommendation = screen.getByText('GitHub App Recommended');
      expect(recommendation).toBeInTheDocument();

      const checkmark = screen.getByText('✓');
      expect(checkmark).toBeInTheDocument();
    });
  });
});
