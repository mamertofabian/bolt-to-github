/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Help from '../Help.svelte';
import { CREATE_TOKEN_URL, CREATE_FINE_GRAINED_TOKEN_URL } from '$lib/constants';

vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

vi.mock('$lib/constants', () => ({
  CREATE_TOKEN_URL: 'https://github.com/settings/tokens/new',
  CREATE_FINE_GRAINED_TOKEN_URL: 'https://github.com/settings/personal-access-tokens/new',
}));

describe('Help.svelte - Component Tests', () => {
  let chromeMocks: {
    tabs: {
      query: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    chromeMocks = {
      tabs: {
        query: vi.fn(),
        sendMessage: vi.fn(),
      },
    };

    global.chrome = {
      tabs: chromeMocks.tabs,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    global.window.close = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should display help page title and description', () => {
      render(Help);

      expect(screen.getByText('Help & Documentation')).toBeInTheDocument();
      expect(screen.getByText(/Learn how to use Bolt to GitHub effectively/i)).toBeInTheDocument();
    });

    it("should display What's New button", () => {
      render(Help);

      expect(screen.getByRole('button', { name: /What's New/i })).toBeInTheDocument();
    });

    it('should display all help section headers', () => {
      render(Help);

      expect(screen.getByRole('button', { name: /Getting Started/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /GitHub Token Guide/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Private Repository Import/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Security & Privacy/i })).toBeInTheDocument();
    });

    it('should display Need More Help section with external links', () => {
      render(Help);

      expect(screen.getByText(/Need More Help?/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /official website/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /GitHub repository/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Discord community/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /AI development tutorials/i })).toBeInTheDocument();
    });
  });

  describe('Section Interaction', () => {
    it('should show Getting Started content when section is clicked', async () => {
      const user = userEvent.setup();
      render(Help);

      const sectionButton = screen.getByRole('button', { name: /Getting Started/i });
      await user.click(sectionButton);

      expect(
        screen.getByText(/Click the extension icon in your browser toolbar/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Follow the popup instructions to set up your GitHub access/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Once configured, you can use Bolt to GitHub from any bolt.new page/i)
      ).toBeInTheDocument();
    });

    it('should hide Getting Started content when section is clicked again', async () => {
      const user = userEvent.setup();
      render(Help);

      const sectionButton = screen.getByRole('button', { name: /Getting Started/i });

      await user.click(sectionButton);
      expect(
        screen.getByText(/Click the extension icon in your browser toolbar/i)
      ).toBeInTheDocument();

      await user.click(sectionButton);
      await waitFor(() => {
        expect(
          screen.queryByText(/Click the extension icon in your browser toolbar/i)
        ).not.toBeInTheDocument();
      });
    });

    it('should show GitHub Token Guide content when section is clicked', async () => {
      const user = userEvent.setup();
      render(Help);

      const sectionButton = screen.getByRole('button', { name: /GitHub Token Guide/i });
      await user.click(sectionButton);

      expect(screen.getByText(/Classic Personal Access Token/i)).toBeInTheDocument();
      expect(screen.getByText(/Fine-Grained Access Token/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Quick to set up, works with both public and private repositories/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Alternative option with more granular permission controls/i)
      ).toBeInTheDocument();
    });

    it('should show Private Repository Import content when section is clicked', async () => {
      const user = userEvent.setup();
      render(Help);

      const sectionButton = screen.getByRole('button', { name: /Private Repository Import/i });
      await user.click(sectionButton);

      expect(screen.getByText(/A temporary public clone is created/i)).toBeInTheDocument();
      expect(screen.getByText(/Important:/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /After importing a private repository, immediately go to the Settings tab/i
        )
      ).toBeInTheDocument();
    });

    it('should show Security & Privacy content when section is clicked', async () => {
      const user = userEvent.setup();
      render(Help);

      const sectionButton = screen.getByRole('button', { name: /Security & Privacy/i });
      await user.click(sectionButton);

      expect(screen.getByText(/Token Usage & Security:/i)).toBeInTheDocument();
      expect(screen.getByText(/Security Notice:/i)).toBeInTheDocument();
      expect(screen.getByText(/Keep your token secure and private/i)).toBeInTheDocument();
      expect(screen.getByText(/Never share your token with others/i)).toBeInTheDocument();
    });
  });

  describe('External Links', () => {
    it('should have correct token creation links with proper attributes', async () => {
      const user = userEvent.setup();
      render(Help);

      const tokenGuideButton = screen.getByRole('button', { name: /GitHub Token Guide/i });
      await user.click(tokenGuideButton);

      const classicTokenLink = screen.getByRole('link', { name: /token creation page/i });
      expect(classicTokenLink).toHaveAttribute('href', CREATE_TOKEN_URL);
      expect(classicTokenLink).toHaveAttribute('target', '_blank');

      const fineGrainedTokenLink = screen.getByRole('link', { name: /fine-grained token page/i });
      expect(fineGrainedTokenLink).toHaveAttribute('href', CREATE_FINE_GRAINED_TOKEN_URL);
      expect(fineGrainedTokenLink).toHaveAttribute('target', '_blank');
    });

    it('should have correct external help links with proper attributes', () => {
      render(Help);

      const websiteLink = screen.getByRole('link', { name: /official website/i });
      expect(websiteLink).toHaveAttribute('href', 'https://bolt2github.com');
      expect(websiteLink).toHaveAttribute('target', '_blank');

      const githubLink = screen.getByRole('link', { name: /GitHub repository/i });
      expect(githubLink).toHaveAttribute('href', 'https://github.com/mamertofabian/bolt-to-github');
      expect(githubLink).toHaveAttribute('target', '_blank');

      const discordLink = screen.getByRole('link', { name: /Discord community/i });
      expect(discordLink).toHaveAttribute('href', 'https://aidrivencoder.com/discord');
      expect(discordLink).toHaveAttribute('target', '_blank');

      const youtubeLink = screen.getByRole('link', { name: /AI development tutorials/i });
      expect(youtubeLink).toHaveAttribute('href', 'https://aidrivencoder.com/youtube');
      expect(youtubeLink).toHaveAttribute('target', '_blank');
    });
  });

  describe("What's New Button Functionality", () => {
    it("should trigger What's New modal when clicked", async () => {
      const user = userEvent.setup();
      const mockTab = { id: 123 };
      chromeMocks.tabs.query.mockResolvedValue([mockTab]);
      chromeMocks.tabs.sendMessage.mockResolvedValue(undefined);

      render(Help);

      const whatsNewButton = screen.getByRole('button', { name: /What's New/i });
      await user.click(whatsNewButton);

      await waitFor(() => {
        expect(chromeMocks.tabs.query).toHaveBeenCalledWith({
          active: true,
          currentWindow: true,
        });
      });

      await waitFor(() => {
        expect(chromeMocks.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: 'SHOW_WHATS_NEW_MODAL',
        });
      });
    });

    it('should close popup window after triggering modal', async () => {
      const user = userEvent.setup();
      const mockTab = { id: 123 };
      chromeMocks.tabs.query.mockResolvedValue([mockTab]);
      chromeMocks.tabs.sendMessage.mockResolvedValue(undefined);

      render(Help);

      const whatsNewButton = screen.getByRole('button', { name: /What's New/i });
      await user.click(whatsNewButton);

      await waitFor(() => {
        expect(window.close).toHaveBeenCalled();
      });
    });

    it('should handle error when tab is not available', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      chromeMocks.tabs.query.mockResolvedValue([{}]);

      render(Help);

      const whatsNewButton = screen.getByRole('button', { name: /What's New/i });
      await user.click(whatsNewButton);

      await waitFor(() => {
        expect(chromeMocks.tabs.sendMessage).not.toHaveBeenCalled();
        expect(window.close).not.toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle error when message sending fails', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockTab = { id: 123 };
      chromeMocks.tabs.query.mockResolvedValue([mockTab]);
      chromeMocks.tabs.sendMessage.mockRejectedValue(new Error('Failed to send message'));

      render(Help);

      const whatsNewButton = screen.getByRole('button', { name: /What's New/i });
      await user.click(whatsNewButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to show What's New modal:",
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles for interactive elements', () => {
      render(Help);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(5);

      expect(screen.getByRole('button', { name: /Getting Started/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /GitHub Token Guide/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Private Repository Import/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Security & Privacy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /What's New/i })).toBeInTheDocument();
    });

    it('should have proper link roles for external resources', () => {
      render(Help);

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);

      expect(screen.getByRole('link', { name: /official website/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /GitHub repository/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Discord community/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /AI development tutorials/i })).toBeInTheDocument();
    });
  });
});
