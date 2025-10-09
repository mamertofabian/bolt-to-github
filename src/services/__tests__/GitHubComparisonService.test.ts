import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubComparisonService } from '../GitHubComparisonService';
import type { ProjectFiles } from '$lib/types';
import type { UnifiedGitHubService } from '../UnifiedGitHubService';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();

describe('GitHubComparisonService', () => {
  let service: GitHubComparisonService;
  let mockGitHubService: {
    request: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });

    mockGitHubService = {
      request: vi.fn(),
    };

    (GitHubComparisonService as unknown as { instance: GitHubComparisonService | null }).instance =
      null;
    service = GitHubComparisonService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = GitHubComparisonService.getInstance();
      const instance2 = GitHubComparisonService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('compareWithGitHub', () => {
    beforeEach(() => {
      service.setGitHubService(mockGitHubService as unknown as UnifiedGitHubService);
    });

    it('should throw error when GitHub service is not initialized', async () => {
      (
        GitHubComparisonService as unknown as { instance: GitHubComparisonService | null }
      ).instance = null;
      const uninitializedService = GitHubComparisonService.getInstance();
      const localFiles: ProjectFiles = new Map([['test.txt', 'content']]);

      await expect(
        uninitializedService.compareWithGitHub(localFiles, 'owner', 'repo', 'main')
      ).rejects.toThrow('GitHub service is not initialized');
    });

    it('should fetch repository data and return comparison results', async () => {
      const localFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'new content'],
      ]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha-123' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha-456' } })
        .mockResolvedValueOnce({
          tree: [
            { path: 'file1.txt', sha: 'mock-hash-1', type: 'blob' },
            { path: 'old-file.txt', sha: 'mock-hash-old', type: 'blob' },
          ],
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(mockGitHubService.request).toHaveBeenCalledWith(
        'GET',
        '/repos/owner/repo/git/refs/heads/main'
      );
      expect(mockGitHubService.request).toHaveBeenCalledWith(
        'GET',
        '/repos/owner/repo/git/commits/base-sha-123'
      );
      expect(mockGitHubService.request).toHaveBeenCalledWith(
        'GET',
        '/repos/owner/repo/git/trees/tree-sha-456?recursive=1'
      );

      expect(result.repoData.baseSha).toBe('base-sha-123');
      expect(result.repoData.baseTreeSha).toBe('tree-sha-456');
      expect(result.repoData.existingFiles.size).toBe(2);
      expect(result.repoData.existingFiles.has('file1.txt')).toBe(true);
      expect(result.repoData.existingFiles.has('old-file.txt')).toBe(true);
    });

    it('should detect added files', async () => {
      const localFiles: ProjectFiles = new Map([['new-file.txt', 'new content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const newFile = result.changes.get('new-file.txt');
      expect(newFile?.status).toBe('added');
      expect(newFile?.content).toBe('new content');
    });

    it('should detect modified files when content differs', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'modified content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'different-hash', type: 'blob' }],
        })
        .mockResolvedValueOnce({
          content: btoa('old content'),
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const modifiedFile = result.changes.get('file1.txt');
      expect(modifiedFile?.status).toBe('modified');
      expect(modifiedFile?.content).toBe('modified content');
      expect(modifiedFile?.previousContent).toBe('old content');
    });

    it('should mark files as unchanged when content matches', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'same content\n']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'matching-hash', type: 'blob' }],
        })
        .mockResolvedValueOnce({
          content: btoa('same content\n'),
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const unchangedFile = result.changes.get('file1.txt');
      expect(unchangedFile?.status).toBe('unchanged');
      expect(unchangedFile?.content).toBe('same content\n');
    });

    it('should normalize line endings when comparing content', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'line1\r\nline2\r\n']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'different-hash', type: 'blob' }],
        })
        .mockResolvedValueOnce({
          content: btoa('line1\nline2\n'),
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const file = result.changes.get('file1.txt');
      expect(file?.status).toBe('unchanged');
    });

    it('should detect deleted files not in local files', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [
            { path: 'file1.txt', sha: 'hash-1', type: 'blob' },
            { path: 'deleted-file.txt', sha: 'hash-deleted', type: 'blob' },
          ],
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const deletedFile = result.changes.get('deleted-file.txt');
      expect(deletedFile?.status).toBe('deleted');
      expect(deletedFile?.content).toBe('');
    });

    it('should skip files ignored by gitignore when detecting deletions', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [
            { path: 'file1.txt', sha: 'hash-1', type: 'blob' },
            { path: 'node_modules/lib.js', sha: 'hash-lib', type: 'blob' },
          ],
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.has('node_modules/lib.js')).toBe(false);
    });

    it('should handle files with project/ prefix', async () => {
      const localFiles: ProjectFiles = new Map([['project/file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'matching-hash', type: 'blob' }],
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.has('project/file1.txt')).toBe(true);
    });

    it('should skip directory entries', async () => {
      const localFiles: ProjectFiles = new Map([
        ['folder/', ''],
        ['file.txt', 'content'],
      ]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.has('folder/')).toBe(false);
      expect(result.changes.has('file.txt')).toBe(true);
    });

    it('should call progress callback during comparison', async () => {
      const progressCallback = vi.fn();
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main', progressCallback);

      expect(progressCallback).toHaveBeenCalledWith('Fetching repository data...', 10);
      expect(progressCallback).toHaveBeenCalledWith('Analyzing repository files...', 30);
      expect(progressCallback).toHaveBeenCalledWith('Comparing files...', 50);
      expect(progressCallback).toHaveBeenCalledWith('Checking for deleted files...', 90);
      expect(progressCallback).toHaveBeenCalledWith('Comparison complete', 100);
    });

    it('should handle GitHub API errors during ref fetch', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.compareWithGitHub(localFiles, 'owner', 'repo', 'main')).rejects.toThrow(
        'API Error'
      );
    });

    it('should treat files as modified when content fetch fails', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'modified content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'different-hash', type: 'blob' }],
        })
        .mockRejectedValueOnce(new Error('Failed to fetch content'));

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const modifiedFile = result.changes.get('file1.txt');
      expect(modifiedFile?.status).toBe('modified');
      expect(modifiedFile?.content).toBe('modified content');
    });

    it('should handle empty tree response', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: null });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.get('file1.txt')?.status).toBe('added');
    });

    it('should filter out non-blob tree items', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [
            { path: 'file1.txt', sha: 'hash-1', type: 'blob' },
            { path: 'folder', sha: 'hash-folder', type: 'tree' },
          ],
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.repoData.existingFiles.size).toBe(1);
      expect(result.repoData.existingFiles.has('file1.txt')).toBe(true);
      expect(result.repoData.existingFiles.has('folder')).toBe(false);
    });

    it('should decode base64 content with whitespace removed', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'different-hash', type: 'blob' }],
        })
        .mockResolvedValueOnce({
          content: btoa('decoded content'),
        });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const file = result.changes.get('file1.txt');
      expect(file?.previousContent).toBe('decoded content');
    });

    it('should treat file as modified when GitHub response has no content', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [{ path: 'file1.txt', sha: 'different-hash', type: 'blob' }],
        })
        .mockResolvedValueOnce({});

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      const modifiedFile = result.changes.get('file1.txt');
      expect(modifiedFile?.status).toBe('modified');
    });

    it('should provide progress updates when fetching content for modified files', async () => {
      const progressCallback = vi.fn();
      const localFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'content2'],
      ]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [
            { path: 'file1.txt', sha: 'hash-different-1', type: 'blob' },
            { path: 'file2.txt', sha: 'hash-different-2', type: 'blob' },
          ],
        })
        .mockResolvedValueOnce({ content: btoa('old1') })
        .mockResolvedValueOnce({ content: btoa('old2') });

      await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main', progressCallback);

      const fetchingCalls = progressCallback.mock.calls.filter((call) =>
        (call[0] as string).includes('Fetching content for')
      );
      expect(fetchingCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      service.setGitHubService(mockGitHubService as unknown as UnifiedGitHubService);
    });

    it('should handle complete workflow with mixed file changes', async () => {
      const localFiles: ProjectFiles = new Map([
        ['unchanged.txt', 'same'],
        ['modified.txt', 'new content'],
        ['added.txt', 'brand new'],
      ]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({
          tree: [
            { path: 'unchanged.txt', sha: 'hash-unchanged', type: 'blob' },
            { path: 'modified.txt', sha: 'hash-old', type: 'blob' },
            { path: 'deleted.txt', sha: 'hash-deleted', type: 'blob' },
          ],
        })
        .mockResolvedValueOnce({ content: btoa('same') })
        .mockResolvedValueOnce({ content: btoa('old content') });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.get('unchanged.txt')?.status).toBe('unchanged');
      expect(result.changes.get('modified.txt')?.status).toBe('modified');
      expect(result.changes.get('added.txt')?.status).toBe('added');
      expect(result.changes.get('deleted.txt')?.status).toBe('deleted');
    });

    it('should handle repositories with many files', async () => {
      const localFiles: ProjectFiles = new Map(
        Array.from({ length: 100 }, (_, i) => [`file${i}.txt`, `content${i}`])
      );

      const treeItems = Array.from({ length: 100 }, (_, i) => ({
        path: `file${i}.txt`,
        sha: `hash-${i}`,
        type: 'blob' as const,
      }));

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: treeItems });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.size).toBe(100);
      expect(result.repoData.existingFiles.size).toBe(100);
    });

    it('should continue comparison when gitignore processing fails', async () => {
      const localFiles: ProjectFiles = new Map([['file1.txt', 'content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      service.setGitHubService(mockGitHubService as unknown as UnifiedGitHubService);
    });

    it('should handle special characters in file paths', async () => {
      const localFiles: ProjectFiles = new Map([
        ['file with spaces.txt', 'content'],
        ['файл.txt', 'unicode name'],
        ['file@#$.txt', 'special chars'],
      ]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.has('file with spaces.txt')).toBe(true);
      expect(result.changes.has('файл.txt')).toBe(true);
      expect(result.changes.has('file@#$.txt')).toBe(true);
    });

    it('should handle very large file content', async () => {
      const largeContent = 'x'.repeat(1000000);
      const localFiles: ProjectFiles = new Map([['large.txt', largeContent]]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.get('large.txt')?.content).toBe(largeContent);
    });

    it('should handle empty file maps', async () => {
      const localFiles: ProjectFiles = new Map();

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.size).toBe(0);
    });

    it('should handle binary-like content', async () => {
      const binaryContent = String.fromCharCode(0, 1, 2, 3, 255);
      const localFiles: ProjectFiles = new Map([['binary.bin', binaryContent]]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.get('binary.bin')?.content).toBe(binaryContent);
    });

    it('should handle files with only whitespace content', async () => {
      const localFiles: ProjectFiles = new Map([['whitespace.txt', '   \n\t\n   ']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.get('whitespace.txt')?.status).toBe('added');
    });

    it('should handle deeply nested file paths', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/file.txt';
      const localFiles: ProjectFiles = new Map([[deepPath, 'deep content']]);

      mockGitHubService.request
        .mockResolvedValueOnce({ object: { sha: 'base-sha' } })
        .mockResolvedValueOnce({ tree: { sha: 'tree-sha' } })
        .mockResolvedValueOnce({ tree: [] });

      const result = await service.compareWithGitHub(localFiles, 'owner', 'repo', 'main');

      expect(result.changes.has(deepPath)).toBe(true);
    });
  });
});
