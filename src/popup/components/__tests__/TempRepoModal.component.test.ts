/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TempRepoModal from '../TempRepoModal.svelte';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');

describe('TempRepoModal', () => {
  const mockTempRepoData = {
    originalRepo: 'user/private-repo',
    tempRepo: 'user/temp-repo-123',
    createdAt: 1699123456789,
    owner: 'user',
  };

  const defaultProps = {
    show: true,
    tempRepoData: mockTempRepoData,
    hasDeletedTempRepo: false,
    hasUsedTempRepoName: false,
    onDeleteTempRepo: vi.fn(),
    onUseTempRepoName: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should not render when show is false', () => {
      render(TempRepoModal, { props: { ...defaultProps, show: false } });

      expect(screen.queryByText('Private Repository Import')).not.toBeInTheDocument();
    });

    it('should render when show is true', () => {
      render(TempRepoModal, { props: defaultProps });

      expect(screen.getByText('Private Repository Import')).toBeInTheDocument();
    });
  });

  describe('User Interface', () => {
    it('should display the main instruction text', () => {
      render(TempRepoModal, { props: defaultProps });

      expect(
        screen.getByText(
          'It looks like you just imported a private GitHub repository. Would you like to:'
        )
      ).toBeInTheDocument();
    });

    it('should display the note about automatic deletion', () => {
      render(TempRepoModal, { props: defaultProps });

      expect(
        screen.getByText(
          'Note: The temporary repository will be automatically deleted in 1 minute if not deleted manually.'
        )
      ).toBeInTheDocument();
    });

    it('should display repository name in the use name button', () => {
      render(TempRepoModal, { props: defaultProps });

      expect(
        screen.getByRole('button', { name: /use original repository name \(user\/private-repo\)/i })
      ).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onDeleteTempRepo when delete button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnDeleteTempRepo = vi.fn();

      render(TempRepoModal, {
        props: { ...defaultProps, onDeleteTempRepo: mockOnDeleteTempRepo },
      });

      await user.click(
        screen.getByRole('button', { name: /delete the temporary public repository now/i })
      );

      expect(mockOnDeleteTempRepo).toHaveBeenCalledTimes(1);
    });

    it('should call onUseTempRepoName when use name button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnUseTempRepoName = vi.fn();

      render(TempRepoModal, {
        props: { ...defaultProps, onUseTempRepoName: mockOnUseTempRepoName },
      });

      await user.click(screen.getByRole('button', { name: /use original repository name/i }));

      expect(mockOnUseTempRepoName).toHaveBeenCalledTimes(1);
    });

    it('should call onDismiss when dismiss button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnDismiss = vi.fn();

      render(TempRepoModal, {
        props: { ...defaultProps, onDismiss: mockOnDismiss },
      });

      await user.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles and accessible names', () => {
      render(TempRepoModal, { props: defaultProps });

      const deleteButton = screen.getByRole('button', {
        name: /delete the temporary public repository now/i,
      });
      const useNameButton = screen.getByRole('button', { name: /use original repository name/i });
      const dismissButton = screen.getByRole('button', { name: /dismiss/i });

      expect(deleteButton).toBeInTheDocument();
      expect(useNameButton).toBeInTheDocument();
      expect(dismissButton).toBeInTheDocument();
    });

    it('should have descriptive text for screen readers', () => {
      render(TempRepoModal, { props: defaultProps });

      expect(screen.getByText('1. Clean up the temporary repository:')).toBeInTheDocument();
      expect(screen.getByText('2. Configure repository name:')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle null tempRepoData gracefully', () => {
      render(TempRepoModal, {
        props: { ...defaultProps, tempRepoData: null },
      });

      expect(
        screen.getByRole('button', { name: /use original repository name \(undefined\)/i })
      ).toBeInTheDocument();
    });

    it('should handle missing tempRepoData gracefully', () => {
      render(TempRepoModal, {
        props: { ...defaultProps, tempRepoData: undefined },
      });

      expect(
        screen.getByRole('button', { name: /use original repository name \(undefined\)/i })
      ).toBeInTheDocument();
    });
  });
});
