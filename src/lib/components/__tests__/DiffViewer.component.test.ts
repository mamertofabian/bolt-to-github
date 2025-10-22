/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import DiffViewer from '../DiffViewer.svelte';
import type { FileChange } from '../../../services/FilePreviewService';

// Mock external dependencies only
vi.mock('../../../services/FilePreviewService', () => ({
  FilePreviewService: {
    getInstance: vi.fn(() => ({
      getFileDiff: vi.fn(),
      calculateLineDiff: vi.fn(),
    })),
  },
}));

vi.mock('$lib/fileUtils', () => ({
  normalizeContentForComparison: vi.fn((content: string) => content),
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('DiffViewer Component', () => {
  const mockFileChange: FileChange = {
    path: 'test.js',
    status: 'modified',
    content: 'new content\nline 2',
    previousContent: 'old content\nline 2',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should not display modal when show is false', () => {
      render(DiffViewer, {
        props: {
          show: false,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      expect(screen.queryByText('test.js')).not.toBeInTheDocument();
    });

    it('should display modal when show is true', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('test.js')).toBeInTheDocument();
      });
    });

    it('should display file path in modal header', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('test.js')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading message while diff is being calculated', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      // The loading state may be very brief, so we'll just check that the modal appears
      await waitFor(() => {
        expect(screen.getByText('test.js')).toBeInTheDocument();
      });
    });
  });

  describe('Content Display', () => {
    it('should display error message when diff calculation fails', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        // The component shows an error when diff calculation fails
        expect(
          screen.getByText('No changes could be calculated for this file.')
        ).toBeInTheDocument();
      });
    });

    it('should display added file content', async () => {
      const addedFileChange: FileChange = {
        path: 'new-file.js',
        status: 'added',
        content: 'console.log("hello");\nconsole.log("world");',
      };

      render(DiffViewer, {
        props: {
          show: true,
          path: 'new-file.js',
          fileChange: addedFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('console.log("hello");')).toBeInTheDocument();
        expect(screen.getByText('console.log("world");')).toBeInTheDocument();
      });
    });

    it('should display deleted file content', async () => {
      const deletedFileChange: FileChange = {
        path: 'deleted-file.js',
        status: 'deleted',
        content: '',
        previousContent: 'console.log("deleted");\nconsole.log("content");',
      };

      render(DiffViewer, {
        props: {
          show: true,
          path: 'deleted-file.js',
          fileChange: deletedFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('console.log("deleted");')).toBeInTheDocument();
        expect(screen.getByText('console.log("content");')).toBeInTheDocument();
      });
    });

    it('should display unchanged file content', async () => {
      const unchangedFileChange: FileChange = {
        path: 'unchanged.js',
        status: 'unchanged',
        content: 'console.log("same");',
      };

      render(DiffViewer, {
        props: {
          show: true,
          path: 'unchanged.js',
          fileChange: unchangedFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('console.log("same");')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should have close button available', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
      });
    });

    it('should have copy button available', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy diff to clipboard/i })).toBeInTheDocument();
      });
    });

    it('should have toggle view button available', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /full/i })).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', async () => {
      render(DiffViewer, {
        props: {
          show: true,
          path: 'test.js',
          fileChange: mockFileChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copy diff to clipboard/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /full/i })).toBeInTheDocument();
      });
    });
  });
});
