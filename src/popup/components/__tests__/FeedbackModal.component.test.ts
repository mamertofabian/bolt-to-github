/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FeedbackModal from '../FeedbackModal.svelte';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

const mockState = {
  submitFeedback: vi.fn(),
  getAllLogs: vi.fn(),
};

vi.mock('../../../services/UnifiedGitHubService', () => {
  return {
    UnifiedGitHubService: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_config?: unknown) {}
      async submitFeedback(params: unknown) {
        return mockState.submitFeedback(params);
      }
    },
  };
});

vi.mock('$lib/utils/logStorage', () => {
  return {
    LogStorageManager: {
      getInstance: () => ({
        getAllLogs: () => mockState.getAllLogs(),
      }),
    },
  };
});

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('FeedbackModal.svelte', () => {
  let chromeMocks: {
    runtime: {
      getManifest: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
      };
    };
    tabs: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  const mockManifest = {
    version: '1.3.12',
    name: 'Bolt to GitHub',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.getAllLogs.mockResolvedValue([]);
    mockState.submitFeedback.mockResolvedValue(undefined);

    Element.prototype.scrollIntoView = vi.fn();

    chromeMocks = {
      runtime: {
        getManifest: vi.fn().mockReturnValue(mockManifest),
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ authenticationMethod: 'pat' }),
        },
      },
      tabs: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };

    Object.defineProperty(window, 'chrome', {
      value: chromeMocks,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should render when show is true', () => {
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      expect(screen.getByText('Send Feedback')).toBeInTheDocument();
    });

    it('should not render when show is false', () => {
      render(FeedbackModal, {
        props: { show: false, githubToken: 'test-token' },
      });

      expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument();
    });
  });

  describe('Category Selection', () => {
    it('should display all feedback categories', () => {
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      expect(screen.getByText(/💝 Appreciation/)).toBeInTheDocument();
      expect(screen.getByText(/❓ Question/)).toBeInTheDocument();
      expect(screen.getByText(/🐛 Bug Report/)).toBeInTheDocument();
      expect(screen.getByText(/✨ Feature Request/)).toBeInTheDocument();
      expect(screen.getByText(/💬 Other/)).toBeInTheDocument();
    });

    it('should allow selecting a category', async () => {
      const user = userEvent.setup();
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Your Message/i)).toBeInTheDocument();
      });
    });

    it('should show log inclusion option only for bug reports', async () => {
      const user = userEvent.setup();
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      expect(screen.queryByLabelText(/Include recent logs/i)).not.toBeInTheDocument();

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Include recent logs/i)).toBeInTheDocument();
      });

      const appreciationButton = screen.getByText(/💝 Appreciation/);
      await user.click(appreciationButton);

      await waitFor(() => {
        expect(screen.queryByLabelText(/Include recent logs/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should not show submit button when no category is selected', () => {
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      expect(screen.queryByRole('button', { name: /Send Feedback/i })).not.toBeInTheDocument();
    });

    it('should disable submit button when message is empty', async () => {
      const user = userEvent.setup();
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Send Feedback/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable submit button when category and message are provided', async () => {
      const user = userEvent.setup();
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Found a bug');

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Send Feedback/i });
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Feedback Submission', () => {
    it('should submit feedback with PAT authentication', async () => {
      const user = userEvent.setup();
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'pat' });

      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Found a bug');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockState.submitFeedback).toHaveBeenCalledWith({
          category: 'bug',
          message: 'Found a bug',
          metadata: {
            browserInfo: expect.any(String),
            extensionVersion: '1.3.12',
          },
        });
      });
    });

    it('should submit feedback with GitHub App authentication', async () => {
      const user = userEvent.setup();
      chromeMocks.storage.local.get.mockResolvedValue({ authenticationMethod: 'github_app' });

      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const featureButton = screen.getByText(/✨ Feature Request/);
      await user.click(featureButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'New feature idea');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockState.submitFeedback).toHaveBeenCalled();
      });
    });

    it('should show success message after successful submission', async () => {
      const user = userEvent.setup();
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Test feedback');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Thank You!')).toBeInTheDocument();
        expect(
          screen.getByText(/Your feedback has been submitted successfully/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Log Handling', () => {
    it('should include logs when checkbox is selected for bug reports', async () => {
      const user = userEvent.setup();
      const mockLogs = [
        {
          timestamp: '2025-10-07T12:00:00Z',
          level: 'error',
          context: 'content',
          module: 'FileHandler',
          message: 'Failed to upload file',
          data: { error: 'Network error' },
        },
      ];

      mockState.getAllLogs.mockResolvedValue(mockLogs);

      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const includeLogsCheckbox = await screen.findByLabelText(/Include recent logs/i);
      await user.click(includeLogsCheckbox);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Bug report');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockState.getAllLogs).toHaveBeenCalled();
        expect(mockState.submitFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Bug report'),
          })
        );
      });
    });

    it('should handle empty logs gracefully', async () => {
      const user = userEvent.setup();
      mockState.getAllLogs.mockResolvedValue([]);

      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const includeLogsCheckbox = await screen.findByLabelText(/Include recent logs/i);
      await user.click(includeLogsCheckbox);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Bug report');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockState.submitFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('No recent logs found'),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message on submission failure', async () => {
      const user = userEvent.setup();
      mockState.submitFeedback.mockRejectedValue(new Error('Network error'));

      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Test');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    it('should show fallback option for authentication errors', async () => {
      const user = userEvent.setup();
      mockState.submitFeedback.mockRejectedValue(new Error('401 Unauthorized'));

      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Test');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/GitHub authentication required/i)).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Submit Feedback on GitHub/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe('Alternative Contact Methods', () => {
    it('should open GitHub issues page in new tab', async () => {
      const user = userEvent.setup();
      render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Your Message/i)).toBeInTheDocument();
      });

      const githubButton = screen.getByRole('button', { name: /Submit on GitHub \(Public\)/i });
      await user.click(githubButton);

      expect(chromeMocks.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/mamertofabian/bolt-to-github/issues/new',
      });
    });
  });

  describe('Modal Close', () => {
    it('should trigger close event when cancel is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const cancelButton = await screen.findByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should close modal on Escape key', async () => {
      const user = userEvent.setup();
      const { component } = render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      await user.keyboard('{Escape}');

      expect(closeHandler).toHaveBeenCalled();
    });
  });

  describe('Success State Auto-Close', () => {
    it('should auto-close modal after successful submission', async () => {
      const user = userEvent.setup();

      const { component } = render(FeedbackModal, {
        props: { show: true, githubToken: 'test-token' },
      });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const bugButton = screen.getByText(/🐛 Bug Report/);
      await user.click(bugButton);

      const messageInput = await screen.findByLabelText(/Your Message/i);
      await user.type(messageInput, 'Test');

      const submitButton = await screen.findByRole('button', { name: /Send Feedback/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Thank You!')).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(closeHandler).toHaveBeenCalled();
        },
        { timeout: 4000 }
      );
    });
  });
});
