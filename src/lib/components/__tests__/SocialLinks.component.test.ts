/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SocialLinks from '../SocialLinks.svelte';

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'chrome', {
    value: {
      tabs: {
        create: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });
});

describe('SocialLinks', () => {
  const mockProps = {
    GITHUB_LINK: 'https://github.com/test/repo',
    YOUTUBE_LINK: 'https://youtube.com/test',
    COFFEE_LINK: 'https://buymeacoffee.com/test',
    HELP_LINK: 'https://help.example.com',
  };

  describe('User Interface', () => {
    it('should display all social action buttons', () => {
      render(SocialLinks, { props: mockProps });

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);

      expect(
        screen.getByRole('button', { name: /send feedback to the developer/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /buy me a coffee/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /stuck\? get expert help/i })).toBeInTheDocument();
    });

    it('should display help button even when HELP_LINK prop is not provided', () => {
      const propsWithoutHelp = {
        GITHUB_LINK: mockProps.GITHUB_LINK,
        YOUTUBE_LINK: mockProps.YOUTUBE_LINK,
        COFFEE_LINK: mockProps.COFFEE_LINK,
      };

      render(SocialLinks, { props: propsWithoutHelp });

      expect(screen.getByRole('button', { name: /stuck\? get expert help/i })).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should allow users to access external links', async () => {
      const user = userEvent.setup();
      render(SocialLinks, { props: mockProps });

      const buttons = screen.getAllByRole('button');

      await user.click(buttons[0]);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: mockProps.GITHUB_LINK });

      await user.click(buttons[1]);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: mockProps.YOUTUBE_LINK });

      await user.click(screen.getByRole('button', { name: /buy me a coffee/i }));
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: mockProps.COFFEE_LINK });

      await user.click(screen.getByRole('button', { name: /stuck\? get expert help/i }));
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: mockProps.HELP_LINK });
    });

    it('should allow users to provide feedback', async () => {
      const user = userEvent.setup();
      const { component } = render(SocialLinks, { props: mockProps });

      const feedbackHandler = vi.fn();
      component.$on('feedback', feedbackHandler);

      await user.click(screen.getByRole('button', { name: /send feedback/i }));

      expect(feedbackHandler).toHaveBeenCalled();
    });

    it('should not open external links when feedback is provided', async () => {
      const user = userEvent.setup();
      render(SocialLinks, { props: mockProps });

      vi.clearAllMocks();

      await user.click(screen.getByRole('button', { name: /send feedback/i }));

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should provide accessible buttons for all actions', () => {
      render(SocialLinks, { props: mockProps });

      const buttons = screen.getAllByRole('button');

      buttons.forEach((button) => {
        expect(button).toBeEnabled();
        expect(button).toBeVisible();
      });
    });

    it('should provide helpful tooltip for feedback action', () => {
      render(SocialLinks, { props: mockProps });

      const feedbackButton = screen.getByRole('button', { name: /send feedback/i });
      expect(feedbackButton).toHaveAttribute('title', 'Send feedback to the developer');
    });
  });

  describe('Customization', () => {
    it('should use custom links when provided', async () => {
      const user = userEvent.setup();
      const customProps = {
        GITHUB_LINK: 'https://github.com/custom/repo',
        YOUTUBE_LINK: 'https://youtube.com/custom',
        COFFEE_LINK: 'https://coffee.com/custom',
        HELP_LINK: 'https://help.custom.com',
      };

      render(SocialLinks, { props: customProps });

      const buttons = screen.getAllByRole('button');

      await user.click(buttons[0]);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: customProps.GITHUB_LINK });

      await user.click(buttons[1]);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: customProps.YOUTUBE_LINK });

      await user.click(screen.getByRole('button', { name: /buy me a coffee/i }));
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: customProps.COFFEE_LINK });

      await user.click(screen.getByRole('button', { name: /stuck\? get expert help/i }));
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: customProps.HELP_LINK });
    });
  });
});
