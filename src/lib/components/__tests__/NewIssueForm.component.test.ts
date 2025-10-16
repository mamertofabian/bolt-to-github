/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import NewIssueForm from '../NewIssueForm.svelte';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/ui/input');
vi.unmock('$lib/components/ui/input/index.ts');
vi.unmock('$lib/components/ui/input/input.svelte');
vi.unmock('$lib/components/ui/label');
vi.unmock('$lib/components/ui/label/index.ts');
vi.unmock('$lib/components/ui/label/label.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('NewIssueForm.svelte - Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render form with title "Create New Issue"', () => {
      render(NewIssueForm);

      expect(screen.getByText('Create New Issue')).toBeInTheDocument();
    });

    it('should render form fields with proper labels', () => {
      render(NewIssueForm);

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('should render form with placeholders for user guidance', () => {
      render(NewIssueForm);

      expect(screen.getByPlaceholderText(/enter issue title/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/describe the issue/i)).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(NewIssueForm);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create issue/i })).toBeInTheDocument();
    });

    it('should mark title field as required', () => {
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toBeRequired();
    });
  });

  describe('Form Interaction', () => {
    it('should allow user to type in title field', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'My issue title');

      expect(titleInput).toHaveValue('My issue title');
    });

    it('should allow user to type in description field', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'This is a detailed description');

      expect(descriptionTextarea).toHaveValue('This is a detailed description');
    });

    it('should allow multiline text in description field', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const descriptionTextarea = screen.getByLabelText(/description/i);
      await user.type(descriptionTextarea, 'Line 1{Enter}Line 2{Enter}Line 3');

      expect(descriptionTextarea).toHaveValue('Line 1\nLine 2\nLine 3');
    });

    it('should allow user to clear and re-enter text', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'First title');
      await user.clear(titleInput);
      await user.type(titleInput, 'Second title');

      expect(titleInput).toHaveValue('Second title');
    });
  });

  describe('Form Submission', () => {
    it('should submit form when user clicks Create Issue button', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Issue Title');
      await user.type(descriptionTextarea, 'Issue Description');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(submitHandler).toHaveBeenCalledTimes(1);
      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: 'Issue Title',
            body: 'Issue Description',
          },
        })
      );
    });

    it('should submit form when user presses Enter in title field', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Issue via Enter key{Enter}');

      expect(submitHandler).toHaveBeenCalledTimes(1);
      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: 'Issue via Enter key',
            body: '',
          },
        })
      );
    });

    it('should submit form with title only when description is empty', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Just a title');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(submitHandler).toHaveBeenCalledTimes(1);
      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: 'Just a title',
            body: '',
          },
        })
      );
    });

    it('should not submit form when title is empty', async () => {
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).toBeDisabled();

      expect(submitHandler).not.toHaveBeenCalled();
    });

    it('should not submit form when title contains only whitespace', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, '   ');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      expect(submitButton).toBeDisabled();

      expect(submitHandler).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Action', () => {
    it('should emit cancel event when user clicks Cancel button', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const cancelHandler = vi.fn();
      component.$on('cancel', cancelHandler);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(cancelHandler).toHaveBeenCalledTimes(1);
    });

    it('should clear form fields when user clicks Cancel', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Some title');
      await user.type(descriptionTextarea, 'Some description');

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(titleInput).toHaveValue('');
      expect(descriptionTextarea).toHaveValue('');
    });

    it('should clear form even if only title was filled', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Only title');

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(titleInput).toHaveValue('');
    });
  });

  describe('Loading State', () => {
    it('should show "Creating..." text when isCreatingIssue is true', () => {
      render(NewIssueForm, { props: { isCreatingIssue: true } });

      expect(screen.getByRole('button', { name: /creating.../i })).toBeInTheDocument();
    });

    it('should show "Create Issue" text when isCreatingIssue is false', () => {
      render(NewIssueForm, { props: { isCreatingIssue: false } });

      expect(screen.getByRole('button', { name: /create issue/i })).toBeInTheDocument();
    });

    it('should disable all form elements when creating issue', () => {
      render(NewIssueForm, { props: { isCreatingIssue: true } });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const submitButton = screen.getByRole('button', { name: /creating.../i });

      expect(titleInput).toBeDisabled();
      expect(descriptionTextarea).toBeDisabled();
      expect(cancelButton).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });

    it('should clear form when creation completes', async () => {
      const user = userEvent.setup();
      const { rerender } = render(NewIssueForm, { props: { isCreatingIssue: false } });

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Test title');
      await user.type(descriptionTextarea, 'Test description');

      await rerender({ isCreatingIssue: true });

      expect(titleInput).toHaveValue('Test title');
      expect(descriptionTextarea).toHaveValue('Test description');

      await rerender({ isCreatingIssue: false });

      await waitFor(() => {
        expect(titleInput).toHaveValue('');
        expect(descriptionTextarea).toHaveValue('');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      render(NewIssueForm);

      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Create New Issue');
      expect(document.querySelector('form')).toBeInTheDocument();
    });

    it('should have accessible form controls', () => {
      render(NewIssueForm);

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create issue/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);
      const cancelButton = screen.getByRole('button', { name: /cancel/i });

      titleInput.focus();
      expect(titleInput).toHaveFocus();

      await user.tab();
      expect(descriptionTextarea).toHaveFocus();

      await user.tab();
      expect(cancelButton).toHaveFocus();
    });

    it('should support reverse keyboard navigation', async () => {
      const user = userEvent.setup();
      render(NewIssueForm);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);
      const cancelButton = screen.getByRole('button', { name: /cancel/i });

      cancelButton.focus();
      expect(cancelButton).toHaveFocus();

      await user.tab({ shift: true });
      expect(descriptionTextarea).toHaveFocus();

      await user.tab({ shift: true });
      expect(titleInput).toHaveFocus();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long content', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const longTitle = 'a'.repeat(500);
      const longDescription = 'b'.repeat(500);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, longTitle);
      await user.click(descriptionTextarea);
      await user.paste(longDescription);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: longTitle,
            body: longDescription,
          },
        })
      );
    });

    it('should handle special characters', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const specialTitle = '<script>alert("test")</script> & "quotes"';
      const specialDescription = 'Description with <b>HTML</b> & "quotes"';

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, specialTitle);
      await user.type(descriptionTextarea, specialDescription);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: specialTitle,
            body: specialDescription,
          },
        })
      );
    });

    it('should handle unicode characters', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const unicodeTitle = '测试标题 🚀 émoji';
      const unicodeDescription = 'Description with 日本語 and émojis 🎉';

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, unicodeTitle);
      await user.type(descriptionTextarea, unicodeDescription);

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: unicodeTitle,
            body: unicodeDescription,
          },
        })
      );
    });

    it('should allow form submission when not in creating state', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm, { props: { isCreatingIssue: false } });
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const titleInput = screen.getByLabelText(/title/i);
      const submitButton = screen.getByRole('button', { name: /create issue/i });

      await user.type(titleInput, 'Test issue');
      await user.click(submitButton);
      expect(submitHandler).toHaveBeenCalledTimes(1);
      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: 'Test issue',
            body: '',
          },
        })
      );
    });

    it('should handle rapid user interactions', async () => {
      const user = userEvent.setup();
      const { component } = render(NewIssueForm);
      const submitHandler = vi.fn();
      component.$on('submit', submitHandler);

      const titleInput = screen.getByLabelText(/title/i);
      const descriptionTextarea = screen.getByLabelText(/description/i);

      await user.type(titleInput, 'Quick');
      await user.type(descriptionTextarea, 'Fast');
      await user.type(titleInput, ' title');
      await user.type(descriptionTextarea, ' description');

      const submitButton = screen.getByRole('button', { name: /create issue/i });
      await user.click(submitButton);

      expect(submitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            title: 'Quick title',
            body: 'Fast description',
          },
        })
      );
    });
  });
});
