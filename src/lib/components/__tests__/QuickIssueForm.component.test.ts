/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import QuickIssueForm from '../QuickIssueForm.svelte';
import { issuesStore } from '$lib/stores/issuesStore';

vi.mock('$lib/stores/issuesStore', () => ({
  issuesStore: {
    createIssue: vi.fn(),
  },
}));

describe('QuickIssueForm Component', () => {
  const defaultProps = {
    show: true,
    githubToken: 'test-token',
    repoOwner: 'test-owner',
    repoName: 'test-repo',
  };

  let mockCreateIssue: ReturnType<typeof vi.mocked<typeof issuesStore.createIssue>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateIssue = vi.mocked(issuesStore.createIssue);
  });

  describe('Modal Visibility', () => {
    it('should not render modal content when show is false', () => {
      render(QuickIssueForm, { props: { ...defaultProps, show: false } });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render modal content when show is true', () => {
      render(QuickIssueForm, { props: defaultProps });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /quick issue/i })).toBeInTheDocument();
    });

    it('should display repository information', () => {
      render(QuickIssueForm, { props: defaultProps });

      expect(screen.getByText('test-owner/test-repo')).toBeInTheDocument();
    });
  });

  describe('Form Input Handling', () => {
    it('should handle title input changes', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue Title');

      expect(titleInput).toHaveValue('Test Issue Title');
    });

    it('should handle description input changes', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Test Description');

      expect(descriptionTextarea).toHaveValue('Test Description');
    });

    it('should disable inputs during submission', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Test Issue');
      await user.click(screen.getByRole('button', { name: /create issue/i }));

      expect(titleInput).toBeDisabled();
      expect(descriptionTextarea).toBeDisabled();
    });
  });

  describe('Form Validation', () => {
    it('should disable submit button when title is empty', () => {
      render(QuickIssueForm, { props: defaultProps });

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button when title is only whitespace', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, '   ');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when title has valid content', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Valid issue title');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should allow submission without description', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Title only');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('should call issuesStore.createIssue with correct parameters on submission', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Test Issue');
      await user.type(descriptionTextarea, 'Test Description');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(mockCreateIssue).toHaveBeenCalledWith('test-owner', 'test-repo', 'test-token', {
        title: 'Test Issue',
        body: 'Test Description',
      });
    });

    it('should trim whitespace from form values before submission', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, '  Test Issue  ');
      await user.type(descriptionTextarea, '  Test Description  ');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(mockCreateIssue).toHaveBeenCalledWith('test-owner', 'test-repo', 'test-token', {
        title: 'Test Issue',
        body: 'Test Description',
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(screen.getByRole('button', { name: /creating.../i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /creating.../i })).toBeDisabled();
    });

    it('should disable cancel button during submission', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });

  describe('Success Handling', () => {
    it('should dispatch success event on successful submission', async () => {
      const user = userEvent.setup();
      const { component } = render(QuickIssueForm, { props: defaultProps });

      const successHandler = vi.fn();
      component.$on('success', successHandler);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(successHandler).toHaveBeenCalled();
      });
    });

    it('should clear form after successful submission', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Test Issue');
      await user.type(descriptionTextarea, 'Test Description');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(titleInput).toHaveValue('');
        expect(descriptionTextarea).toHaveValue('');
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message on submission failure', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockRejectedValue(new Error('Network error'));

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    it('should display generic error message for non-Error exceptions', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockRejectedValue('String error');

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to create issue/i)).toBeInTheDocument();
      });
    });

    it('should clear error on new submission attempt', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockRejectedValueOnce(new Error('First error')).mockResolvedValueOnce({
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        html_url: 'https://github.com/test/test/issues/1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        comments: 0,
        user: { login: 'testuser', avatar_url: 'https://github.com/testuser.png' },
        labels: [],
      });

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/first error/i)).toBeInTheDocument();
      });

      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText(/first error/i)).not.toBeInTheDocument();
      });
    });

    it('should re-enable form after error', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockRejectedValue(new Error('Network error'));

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      expect(titleInput).not.toBeDisabled();
      expect(screen.getByLabelText(/description/i)).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
    });
  });

  describe('Cancel/Close Behavior', () => {
    it('should dispatch close event when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const { component } = render(QuickIssueForm, { props: defaultProps });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should clear form when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Test Issue');
      await user.type(descriptionTextarea, 'Test Description');

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(titleInput).toHaveValue('');
      expect(descriptionTextarea).toHaveValue('');
    });

    it('should clear error when cancel button is clicked', async () => {
      const user = userEvent.setup();
      mockCreateIssue.mockRejectedValue(new Error('Network error'));

      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Test Issue');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });

    it('should dispatch close event when Escape key is pressed', async () => {
      const user = userEvent.setup();
      const { component } = render(QuickIssueForm, { props: defaultProps });

      const closeHandler = vi.fn();
      component.$on('close', closeHandler);

      await user.keyboard('{Escape}');

      expect(closeHandler).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long titles', async () => {
      const user = userEvent.setup();
      const longTitle = 'a'.repeat(500);
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, longTitle);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(mockCreateIssue).toHaveBeenCalledWith('test-owner', 'test-repo', 'test-token', {
        title: longTitle,
        body: '',
      });
    });

    it('should handle special characters in title and description', async () => {
      const user = userEvent.setup();
      const specialTitle = '<script>alert("test")</script> & "quotes"';
      const specialDescription = 'Description with <script> & "quotes"';
      render(QuickIssueForm, { props: defaultProps });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, specialTitle);
      await user.type(descriptionTextarea, specialDescription);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(mockCreateIssue).toHaveBeenCalledWith('test-owner', 'test-repo', 'test-token', {
        title: specialTitle,
        body: specialDescription,
      });
    });
  });
});
