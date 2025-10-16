/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FileChanges from '../FileChanges.svelte';
import type { FileChange } from '../../services/FilePreviewService';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

describe('FileChanges.svelte', () => {
  const createFileChangesMap = (
    changes: Array<[string, Omit<FileChange, 'content'> & { content?: string }]>
  ): Map<string, FileChange> => {
    return new Map(
      changes.map(([path, change]) => [path, { ...change, content: change.content || '' }])
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File Changes Display', () => {
    it('should display file count summary', () => {
      const changes = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
        ['file2.ts', { status: 'modified', path: 'file2.ts', previousContent: 'old' }],
        ['file3.ts', { status: 'unchanged', path: 'file3.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/2 changed files \(of 3 total\)/i)).toBeInTheDocument();
    });

    it('should display zero changes when no files are changed', () => {
      const changes = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
        ['file2.ts', { status: 'unchanged', path: 'file2.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/0 changed files \(of 2 total\)/i)).toBeInTheDocument();
    });

    it('should display empty state when no changes exist', () => {
      const changes = createFileChangesMap([
        ['file1.ts', { status: 'unchanged', path: 'file1.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(
        screen.getByText(/no changes detected. your files are up to date./i)
      ).toBeInTheDocument();
    });

    it('should display empty state when no files exist', () => {
      const changes = new Map<string, FileChange>();

      render(FileChanges, { props: { changes } });

      expect(
        screen.getByText(/no changes detected. your files are up to date./i)
      ).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should show Changed tab as active by default', () => {
      const changes = createFileChangesMap([['file1.ts', { status: 'added', path: 'file1.ts' }]]);

      render(FileChanges, { props: { changes } });

      const changedTab = screen.getByRole('button', { name: /changed \(1\)/i });
      expect(changedTab).toHaveClass('active');
    });

    it('should switch to All Files tab when clicked', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
        ['file2.ts', { status: 'unchanged', path: 'file2.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      const allFilesTab = screen.getByRole('button', { name: /all files \(2\)/i });
      await user.click(allFilesTab);

      expect(allFilesTab).toHaveClass('active');
    });

    it('should switch back to Changed tab when clicked', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([['file1.ts', { status: 'added', path: 'file1.ts' }]]);

      render(FileChanges, { props: { changes } });

      const allFilesTab = screen.getByRole('button', { name: /all files/i });
      const changedTab = screen.getByRole('button', { name: /changed/i });

      await user.click(allFilesTab);
      expect(allFilesTab).toHaveClass('active');

      await user.click(changedTab);
      expect(changedTab).toHaveClass('active');
    });

    it('should display correct counts in tab labels', () => {
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['modified.ts', { status: 'modified', path: 'modified.ts', previousContent: 'old' }],
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByRole('button', { name: /changed \(2\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /all files \(3\)/i })).toBeInTheDocument();
    });
  });

  describe('Changed Files Display', () => {
    it('should display added files with correct status and icon', () => {
      const changes = createFileChangesMap([
        ['src/file1.ts', { status: 'added', path: 'src/file1.ts' }],
        ['src/file2.ts', { status: 'added', path: 'src/file2.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/added \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('src/file1.ts')).toBeInTheDocument();
      expect(screen.getByText('src/file2.ts')).toBeInTheDocument();
      expect(screen.getAllByText('➕')).toHaveLength(2);
    });

    it('should display modified files with correct status and icon', () => {
      const changes = createFileChangesMap([
        ['src/file1.ts', { status: 'modified', path: 'src/file1.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/modified \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('src/file1.ts')).toBeInTheDocument();
      expect(screen.getByText('✏️')).toBeInTheDocument();
    });

    it('should display deleted files with correct status and icon', () => {
      const changes = createFileChangesMap([
        ['src/file1.ts', { status: 'deleted', path: 'src/file1.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/deleted \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('src/file1.ts')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument();
    });

    it('should not display unchanged files in changed tab', () => {
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText('added.ts')).toBeInTheDocument();
      expect(screen.queryByText('unchanged.ts')).not.toBeInTheDocument();
    });

    it('should group files by status with correct counts', () => {
      const changes = createFileChangesMap([
        ['added1.ts', { status: 'added', path: 'added1.ts' }],
        ['added2.ts', { status: 'added', path: 'added2.ts' }],
        ['modified1.ts', { status: 'modified', path: 'modified1.ts', previousContent: 'old' }],
        ['deleted1.ts', { status: 'deleted', path: 'deleted1.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/added \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/modified \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/deleted \(1\)/i)).toBeInTheDocument();
    });
  });

  describe('All Files Display', () => {
    it('should display all files when All Files tab is active', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['modified.ts', { status: 'modified', path: 'modified.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));

      expect(screen.getByText('added.ts')).toBeInTheDocument();
      expect(screen.getByText('modified.ts')).toBeInTheDocument();
    });

    it('should show checkbox to toggle unchanged files visibility', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));

      expect(screen.getByLabelText(/show unchanged files \(1\)/i)).toBeInTheDocument();
    });

    it('should hide unchanged files by default', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));

      expect(screen.getByText('added.ts')).toBeInTheDocument();
      expect(screen.queryByText('unchanged.ts')).not.toBeInTheDocument();
    });

    it('should show unchanged files when checkbox is checked', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));
      await user.click(screen.getByLabelText(/show unchanged files/i));

      await waitFor(() => {
        expect(screen.getByText('unchanged.ts')).toBeInTheDocument();
      });
    });

    it('should hide unchanged files when checkbox is unchecked', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['added.ts', { status: 'added', path: 'added.ts' }],
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));

      const checkbox = screen.getByLabelText(/show unchanged files/i);
      await user.click(checkbox);
      expect(screen.getByText('unchanged.ts')).toBeInTheDocument();

      await user.click(checkbox);
      expect(screen.queryByText('unchanged.ts')).not.toBeInTheDocument();
    });

    it('should display unchanged files section when shown', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));
      await user.click(screen.getByLabelText(/show unchanged files/i));

      await waitFor(() => {
        expect(screen.getByText(/unchanged \(1\)/i)).toBeInTheDocument();
      });
    });
  });

  describe('File Path Display', () => {
    it('should remove project/ prefix from file paths', () => {
      const changes = createFileChangesMap([
        ['project/src/file.ts', { status: 'added', path: 'project/src/file.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText('src/file.ts')).toBeInTheDocument();
      expect(screen.queryByText('project/src/file.ts')).not.toBeInTheDocument();
    });

    it('should display paths without project/ prefix as is', () => {
      const changes = createFileChangesMap([
        ['src/components/Button.svelte', { status: 'added', path: 'src/components/Button.svelte' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText('src/components/Button.svelte')).toBeInTheDocument();
    });

    it('should handle paths with multiple project/ occurrences', () => {
      const changes = createFileChangesMap([
        ['project/project/file.ts', { status: 'added', path: 'project/project/file.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText('project/file.ts')).toBeInTheDocument();
    });
  });

  describe('Diff Viewer Integration', () => {
    it('should display Diff button for added files', () => {
      const changes = createFileChangesMap([['file.ts', { status: 'added', path: 'file.ts' }]]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument();
    });

    it('should display Diff button for modified files', () => {
      const changes = createFileChangesMap([
        ['file.ts', { status: 'modified', path: 'file.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument();
    });

    it('should display Diff button for deleted files', () => {
      const changes = createFileChangesMap([
        ['file.ts', { status: 'deleted', path: 'file.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument();
    });

    it('should not display Diff button for unchanged files', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));
      await user.click(screen.getByLabelText(/show unchanged files/i));

      await waitFor(() => {
        expect(screen.getByText('unchanged.ts')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /diff/i })).not.toBeInTheDocument();
    });

    it('should display multiple Diff buttons for multiple changed files', () => {
      const changes = createFileChangesMap([
        ['file1.ts', { status: 'added', path: 'file1.ts' }],
        ['file2.ts', { status: 'modified', path: 'file2.ts', previousContent: 'old' }],
        ['file3.ts', { status: 'deleted', path: 'file3.ts', previousContent: 'old' }],
      ]);

      render(FileChanges, { props: { changes } });

      const diffButtons = screen.getAllByRole('button', { name: /diff/i });
      expect(diffButtons).toHaveLength(3);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels for tabs', () => {
      const changes = createFileChangesMap([['file.ts', { status: 'added', path: 'file.ts' }]]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByRole('button', { name: /changed \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /all files \(1\)/i })).toBeInTheDocument();
    });

    it('should have accessible button labels for diff buttons', () => {
      const changes = createFileChangesMap([['file.ts', { status: 'added', path: 'file.ts' }]]);

      render(FileChanges, { props: { changes } });

      const diffButton = screen.getByRole('button', { name: /diff/i });
      expect(diffButton).toHaveAttribute('title', 'View changes');
    });

    it('should have accessible checkbox label for show unchanged', async () => {
      const user = userEvent.setup();
      const changes = createFileChangesMap([
        ['unchanged.ts', { status: 'unchanged', path: 'unchanged.ts' }],
      ]);

      render(FileChanges, { props: { changes } });

      await user.click(screen.getByRole('button', { name: /all files/i }));

      expect(screen.getByLabelText(/show unchanged files \(1\)/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle large number of files', () => {
      const changes = createFileChangesMap(
        Array.from({ length: 100 }, (_, i) => [
          `file${i}.ts`,
          { status: 'added', path: `file${i}.ts` },
        ]) as Array<[string, Omit<FileChange, 'content'> & { content?: string }]>
      );

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(/100 changed files \(of 100 total\)/i)).toBeInTheDocument();
      expect(screen.getByText(/added \(100\)/i)).toBeInTheDocument();
    });

    it('should handle files with very long paths', () => {
      const longPath = 'src/components/' + 'a'.repeat(100) + '/file.ts';
      const changes = createFileChangesMap([[longPath, { status: 'added', path: longPath }]]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(longPath)).toBeInTheDocument();
    });

    it('should handle files with special characters in path', () => {
      const specialPath = 'src/file-name_with.special~chars!@#.ts';
      const changes = createFileChangesMap([[specialPath, { status: 'added', path: specialPath }]]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(specialPath)).toBeInTheDocument();
    });

    it('should handle files with unicode characters in path', () => {
      const unicodePath = 'src/文件名.ts';
      const changes = createFileChangesMap([[unicodePath, { status: 'added', path: unicodePath }]]);

      render(FileChanges, { props: { changes } });

      expect(screen.getByText(unicodePath)).toBeInTheDocument();
    });
  });
});
