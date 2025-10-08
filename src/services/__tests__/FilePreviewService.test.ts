import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilePreviewService } from '../FilePreviewService';
import type { ProjectFiles } from '$lib/types';
import type { FileChange } from '../FilePreviewService';

vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../DownloadService');
vi.mock('../CacheService');
vi.mock('../GitHubComparisonService');
vi.mock('../IdleMonitorService');
vi.mock('../../lib/fileUtils');

describe('FilePreviewService', () => {
  let service: FilePreviewService;
  let mockDownloadService: {
    getProjectFiles: ReturnType<typeof vi.fn>;
  };
  let mockCacheService: {
    onCacheRefreshNeeded: ReturnType<typeof vi.fn>;
    removeRefreshCallback: ReturnType<typeof vi.fn>;
  };
  let mockGitHubComparisonService: {
    compareWithGitHub: ReturnType<typeof vi.fn>;
    setGitHubService: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const { DownloadService } = await import('../DownloadService');
    const { CacheService } = await import('../CacheService');
    const { GitHubComparisonService } = await import('../GitHubComparisonService');
    const { IdleMonitorService } = await import('../IdleMonitorService');
    const { processFilesWithGitignore } = await import('../../lib/fileUtils');

    mockDownloadService = {
      getProjectFiles: vi.fn(),
    };

    mockCacheService = {
      onCacheRefreshNeeded: vi.fn(),
      removeRefreshCallback: vi.fn(),
    };

    mockGitHubComparisonService = {
      compareWithGitHub: vi.fn(),
      setGitHubService: vi.fn(),
    };

    vi.mocked(DownloadService).mockImplementation(
      () => mockDownloadService as unknown as InstanceType<typeof DownloadService>
    );

    vi.mocked(CacheService.getInstance).mockReturnValue(
      mockCacheService as unknown as ReturnType<typeof CacheService.getInstance>
    );

    vi.mocked(GitHubComparisonService.getInstance).mockReturnValue(
      mockGitHubComparisonService as unknown as ReturnType<
        typeof GitHubComparisonService.getInstance
      >
    );

    vi.mocked(IdleMonitorService.getInstance).mockReturnValue({} as never);

    vi.mocked(processFilesWithGitignore).mockImplementation((files) => files);

    (FilePreviewService as unknown as { instance: FilePreviewService | null }).instance = null;
    service = FilePreviewService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FilePreviewService.getInstance();
      const instance2 = FilePreviewService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should handle IdleMonitorService initialization errors', async () => {
      const { IdleMonitorService } = await import('../IdleMonitorService');
      vi.mocked(IdleMonitorService.getInstance).mockImplementation(() => {
        throw new Error('IdleMonitor unavailable');
      });

      expect(() => FilePreviewService.getInstance()).not.toThrow();
    });
  });

  describe('loadProjectFiles', () => {
    it('should load files using DownloadService', async () => {
      const mockFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'content2'],
      ]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const result = await service.loadProjectFiles();

      expect(mockDownloadService.getProjectFiles).toHaveBeenCalledWith(false);
      expect(result).toEqual(mockFiles);
    });

    it('should return cached files when not forcing refresh', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content1']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      mockDownloadService.getProjectFiles.mockClear();

      const result = await service.loadProjectFiles();

      expect(mockDownloadService.getProjectFiles).not.toHaveBeenCalled();
      expect(result).toEqual(mockFiles);
    });

    it('should force refresh when requested', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'old content']]);
      const newFiles: ProjectFiles = new Map([['file1.txt', 'new content']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      const result = await service.loadProjectFiles(true);

      expect(mockDownloadService.getProjectFiles).toHaveBeenCalledWith(true);
      expect(result).toEqual(newFiles);
    });

    it('should store previous files when loading new ones', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'old']]);
      const newFiles: ProjectFiles = new Map([['file1.txt', 'new']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const changes = await service.getChangedFiles();
      expect(changes.get('file1.txt')?.status).toBe('modified');
    });

    it('should reset changed files on new load', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      await service.getChangedFiles();

      await service.loadProjectFiles(true);

      const privateService = service as unknown as { changedFiles: Map<string, FileChange> | null };
      expect(privateService.changedFiles).toBeNull();
    });
  });

  describe('getProcessedFiles', () => {
    it('should process files with gitignore rules', async () => {
      const mockFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['node_modules/lib.js', 'lib content'],
      ]);
      const processedFiles: ProjectFiles = new Map([['file1.txt', 'content1']]);

      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);
      const { processFilesWithGitignore } = await import('../../lib/fileUtils');
      vi.mocked(processFilesWithGitignore).mockResolvedValue(processedFiles);

      const result = await service.getProcessedFiles();

      expect(processFilesWithGitignore).toHaveBeenCalledWith(mockFiles);
      expect(result).toEqual(processedFiles);
    });

    it('should force refresh when requested', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.getProcessedFiles(true);

      expect(mockDownloadService.getProjectFiles).toHaveBeenCalledWith(true);
    });
  });

  describe('getFileContent', () => {
    it('should return file content if it exists', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'hello world']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const content = await service.getFileContent('file1.txt');

      expect(content).toBe('hello world');
    });

    it('should return null if file does not exist', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const content = await service.getFileContent('nonexistent.txt');

      expect(content).toBeNull();
    });

    it('should return null if files map is empty', async () => {
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      const content = await service.getFileContent('file1.txt');

      expect(content).toBeNull();
    });
  });

  describe('getChangedFiles', () => {
    it('should mark all files as unchanged on first load', async () => {
      const mockFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'content2'],
      ]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      const changes = await service.getChangedFiles();

      expect(changes.size).toBe(2);
      expect(changes.get('file1.txt')?.status).toBe('unchanged');
      expect(changes.get('file2.txt')?.status).toBe('unchanged');
    });

    it('should detect added files', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'content1']]);
      const newFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'content2'],
      ]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const changes = await service.getChangedFiles();
      expect(changes.get('file2.txt')?.status).toBe('added');
      expect(changes.get('file2.txt')?.content).toBe('content2');
    });

    it('should detect modified files', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'old content']]);
      const newFiles: ProjectFiles = new Map([['file1.txt', 'new content']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const changes = await service.getChangedFiles();
      expect(changes.get('file1.txt')?.status).toBe('modified');
      expect(changes.get('file1.txt')?.content).toBe('new content');
      expect(changes.get('file1.txt')?.previousContent).toBe('old content');
    });

    it('should detect deleted files', async () => {
      const oldFiles: ProjectFiles = new Map([
        ['file1.txt', 'content1'],
        ['file2.txt', 'content2'],
      ]);
      const newFiles: ProjectFiles = new Map([['file1.txt', 'content1']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const changes = await service.getChangedFiles();
      expect(changes.get('file2.txt')?.status).toBe('deleted');
      expect(changes.get('file2.txt')?.content).toBe('');
      expect(changes.get('file2.txt')?.previousContent).toBe('content2');
    });

    it('should detect unchanged files', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'same content']]);
      const newFiles: ProjectFiles = new Map([['file1.txt', 'same content']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const changes = await service.getChangedFiles();
      expect(changes.get('file1.txt')?.status).toBe('unchanged');
    });

    it('should cache changed files result', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      const changes1 = await service.getChangedFiles();
      const changes2 = await service.getChangedFiles();

      expect(changes1).toBe(changes2);
    });

    it('should handle empty file maps', async () => {
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      await service.loadProjectFiles();
      const changes = await service.getChangedFiles();

      expect(changes.size).toBe(0);
    });
  });

  describe('getFileDiff', () => {
    it('should return null for non-existent file', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      const diff = await service.getFileDiff('nonexistent.txt');

      expect(diff).toBeNull();
    });

    it('should return unchanged diff for unchanged files', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'line1\nline2\nline3']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      const diff = await service.getFileDiff('file1.txt');

      expect(diff).not.toBeNull();
      expect(diff?.changes.every((c) => c.type === 'unchanged')).toBe(true);
      expect(diff?.changes).toHaveLength(3);
    });

    it('should return added diff for new files', async () => {
      const oldFiles: ProjectFiles = new Map();
      const newFiles: ProjectFiles = new Map([['file1.txt', 'line1\nline2']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const diff = await service.getFileDiff('file1.txt');

      expect(diff).not.toBeNull();
      expect(diff?.changes.every((c) => c.type === 'added')).toBe(true);
      expect(diff?.changes).toHaveLength(2);
    });

    it('should return deleted diff for deleted files', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'line1\nline2']]);
      const newFiles: ProjectFiles = new Map();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const diff = await service.getFileDiff('file1.txt');

      expect(diff).not.toBeNull();
      expect(diff?.changes.every((c) => c.type === 'deleted')).toBe(true);
      expect(diff?.changes).toHaveLength(2);
    });

    it('should calculate line-by-line diff for modified files', async () => {
      const oldFiles: ProjectFiles = new Map([['file1.txt', 'line1\nline2\nline3']]);
      const newFiles: ProjectFiles = new Map([['file1.txt', 'line1\nmodified\nline3']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const diff = await service.getFileDiff('file1.txt');

      expect(diff).not.toBeNull();
      expect(diff?.path).toBe('file1.txt');
      expect(diff?.changes.length).toBeGreaterThan(0);
    });
  });

  describe('calculateLineDiff', () => {
    it('should calculate diff between two versions', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nmodified\nline3';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.path).toBe('test.txt');
      expect(diff.changes.length).toBeGreaterThan(0);
      expect(diff.isContextual).toBeUndefined();
    });

    it('should show all lines when contextLines is 0', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5';
      const newContent = 'line1\nline2\nmodified\nline4\nline5';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 0);

      expect(diff.isContextual).toBeUndefined();
      expect(diff.totalLines).toBeUndefined();
    });

    it('should create contextual diff when contextLines > 0', () => {
      const oldContent = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';
      const newContent =
        'line1\nline2\nmodified3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 2);

      expect(diff.isContextual).toBe(true);
      expect(diff.totalLines).toBeGreaterThan(0);
      expect(diff.changes.length).toBeLessThan(diff.totalLines!);
    });

    it('should handle empty content', () => {
      const diff = service.calculateLineDiff('test.txt', '', '');

      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].content).toBe('');
    });

    it('should handle completely different files', () => {
      const oldContent = 'completely\ndifferent\nold\nfile';
      const newContent = 'totally\nnew\ncontent\nhere';

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent);

      expect(diff.changes.length).toBeGreaterThan(0);
      const hasDeleted = diff.changes.some((c) => c.type === 'deleted');
      const hasAdded = diff.changes.some((c) => c.type === 'added');
      expect(hasDeleted || hasAdded).toBe(true);
    });

    it('should merge overlapping context ranges', () => {
      const oldContent = Array(20)
        .fill(0)
        .map((_, i) => `line${i + 1}`)
        .join('\n');
      const newContent = Array(20)
        .fill(0)
        .map((_, i) => (i === 3 || i === 5 ? `modified${i + 1}` : `line${i + 1}`))
        .join('\n');

      const diff = service.calculateLineDiff('test.txt', oldContent, newContent, 2);

      expect(diff.isContextual).toBe(true);
      const hasSkippedMarker = diff.changes.some((c) => c.lineNumber === -1);
      expect(hasSkippedMarker || diff.changes.length < 20).toBe(true);
    });
  });

  describe('createFilePreview', () => {
    it('should create preview element with file content', async () => {
      const mockFiles: ProjectFiles = new Map([['test.js', 'console.log("test");']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const container = document.createElement('div');
      await service.createFilePreview('test.js', container);

      const pre = container.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre?.classList.contains('file-preview')).toBe(true);
      expect(pre?.classList.contains('language-js')).toBe(true);

      const code = pre?.querySelector('code');
      expect(code?.textContent).toBe('console.log("test");');
    });

    it('should show error message for non-existent file', async () => {
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      const container = document.createElement('div');
      await service.createFilePreview('nonexistent.txt', container);

      expect(container.innerHTML).toContain('File not found');
      expect(container.innerHTML).toContain('nonexistent.txt');
    });

    it('should apply syntax highlighting class based on extension', async () => {
      const mockFiles: ProjectFiles = new Map([
        ['test.ts', 'const x = 1;'],
        ['test.py', 'x = 1'],
        ['test.txt', 'plain text'],
      ]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const tsContainer = document.createElement('div');
      await service.createFilePreview('test.ts', tsContainer);
      expect(tsContainer.querySelector('pre')?.classList.contains('language-ts')).toBe(true);

      const pyContainer = document.createElement('div');
      await service.createFilePreview('test.py', pyContainer);
      expect(pyContainer.querySelector('pre')?.classList.contains('language-py')).toBe(true);

      const txtContainer = document.createElement('div');
      await service.createFilePreview('test.txt', txtContainer);
      expect(txtContainer.querySelector('pre')?.classList.contains('language-txt')).toBe(true);
    });

    it('should use Prism for syntax highlighting if available', async () => {
      const mockFiles: ProjectFiles = new Map([['test.js', 'code']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const mockPrism = {
        highlightElement: vi.fn(),
      };
      (window as { Prism?: typeof mockPrism }).Prism = mockPrism;

      const container = document.createElement('div');
      await service.createFilePreview('test.js', container);

      expect(mockPrism.highlightElement).toHaveBeenCalled();

      delete (window as { Prism?: typeof mockPrism }).Prism;
    });

    it('should clear container before adding preview', async () => {
      const mockFiles: ProjectFiles = new Map([['test.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const container = document.createElement('div');
      container.innerHTML = '<div>old content</div>';

      await service.createFilePreview('test.txt', container);

      expect(container.querySelectorAll('div')).toHaveLength(0);
      expect(container.querySelector('pre')).not.toBeNull();
    });
  });

  describe('createFileDiff', () => {
    it('should create diff UI for file changes', async () => {
      const oldFiles: ProjectFiles = new Map([['test.txt', 'line1\nline2']]);
      const newFiles: ProjectFiles = new Map([['test.txt', 'line1\nmodified']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const container = document.createElement('div');
      await service.createFileDiff('test.txt', container);

      const diffContainer = container.querySelector('.diff-container');
      expect(diffContainer).not.toBeNull();

      const header = container.querySelector('.diff-header');
      expect(header?.textContent).toBe('test.txt');

      const diffContent = container.querySelector('.diff-content');
      expect(diffContent).not.toBeNull();
    });

    it('should show info message when no changes', async () => {
      const container = document.createElement('div');
      await service.createFileDiff('nonexistent.txt', container);

      expect(container.innerHTML).toContain('No changes in file');
      expect(container.innerHTML).toContain('nonexistent.txt');
    });

    it('should create diff lines with correct prefixes', async () => {
      const oldFiles: ProjectFiles = new Map([['test.txt', 'deleted\nunchanged\nold']]);
      const newFiles: ProjectFiles = new Map([['test.txt', 'added\nunchanged\nnew']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const container = document.createElement('div');
      await service.createFileDiff('test.txt', container);

      const diffLines = container.querySelectorAll('.diff-line');
      expect(diffLines.length).toBeGreaterThan(0);

      const hasPrefix = Array.from(diffLines).some((line) => {
        const prefix = line.querySelector('.diff-line-prefix');
        return prefix && ['+', '-', ' '].includes(prefix.textContent || '');
      });
      expect(hasPrefix).toBe(true);
    });

    it('should clear container before adding diff', async () => {
      const mockFiles: ProjectFiles = new Map([['test.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();

      const container = document.createElement('div');
      container.innerHTML = '<div>old content</div>';

      await service.createFileDiff('test.txt', container);

      expect(container.querySelectorAll('div:not([class])')).toHaveLength(0);
    });
  });

  describe('compareWithGitHub', () => {
    it('should compare files with GitHub repository', async () => {
      const mockFiles: ProjectFiles = new Map([['test.txt', 'content']]);
      const mockChanges: Map<string, FileChange> = new Map([
        ['test.txt', { path: 'test.txt', status: 'modified', content: 'content' }],
      ]);

      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);
      const { processFilesWithGitignore } = await import('../../lib/fileUtils');
      vi.mocked(processFilesWithGitignore).mockResolvedValue(mockFiles);

      mockGitHubComparisonService.compareWithGitHub.mockResolvedValue({
        changes: mockChanges,
        summary: { added: 0, modified: 1, deleted: 0, unchanged: 0 },
      });

      const result = await service.compareWithGitHub('owner', 'repo', 'main');

      expect(mockGitHubComparisonService.compareWithGitHub).toHaveBeenCalledWith(
        mockFiles,
        'owner',
        'repo',
        'main',
        expect.any(Function)
      );
      expect(result).toEqual(mockChanges);
    });

    it('should use provided GitHub service', async () => {
      const mockFiles: ProjectFiles = new Map([['test.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);
      const { processFilesWithGitignore } = await import('../../lib/fileUtils');
      vi.mocked(processFilesWithGitignore).mockResolvedValue(mockFiles);

      mockGitHubComparisonService.compareWithGitHub.mockResolvedValue({
        changes: new Map(),
        summary: { added: 0, modified: 0, deleted: 0, unchanged: 0 },
      });

      const mockGitHubService = {} as never;
      await service.compareWithGitHub('owner', 'repo', 'main', mockGitHubService);

      expect(mockGitHubComparisonService.setGitHubService).toHaveBeenCalledWith(mockGitHubService);
    });

    it('should throw error when no files are available', async () => {
      mockDownloadService.getProjectFiles.mockResolvedValue(new Map());

      await expect(service.compareWithGitHub('owner', 'repo', 'main')).rejects.toThrow(
        'No files loaded or all files were ignored by gitignore rules.'
      );
    });

    it('should call progress callback during comparison', async () => {
      const mockFiles: ProjectFiles = new Map([['test.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);
      const { processFilesWithGitignore } = await import('../../lib/fileUtils');
      vi.mocked(processFilesWithGitignore).mockResolvedValue(mockFiles);

      mockGitHubComparisonService.compareWithGitHub.mockImplementation(
        async (_files, _owner, _repo, _branch, progressCallback) => {
          if (progressCallback) {
            progressCallback('Testing', 50);
          }
          return {
            changes: new Map(),
            summary: { added: 0, modified: 0, deleted: 0, unchanged: 0 },
          };
        }
      );

      await service.compareWithGitHub('owner', 'repo', 'main');

      expect(mockGitHubComparisonService.compareWithGitHub).toHaveBeenCalled();
    });
  });

  describe('Cache Refresh Handling', () => {
    it('should register cache refresh callback on initialization', () => {
      expect(mockCacheService.onCacheRefreshNeeded).toHaveBeenCalled();
    });

    it('should clear stored files when cache is refreshed', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();

      const refreshCallback = mockCacheService.onCacheRefreshNeeded.mock.calls[0][0];
      refreshCallback('test-project');

      const privateService = service as unknown as {
        currentFiles: ProjectFiles | null;
        previousFiles: ProjectFiles | null;
        changedFiles: Map<string, FileChange> | null;
      };
      expect(privateService.currentFiles).toBeNull();
      expect(privateService.previousFiles).toBeNull();
      expect(privateService.changedFiles).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove cache refresh callback', () => {
      service.cleanup();

      expect(mockCacheService.removeRefreshCallback).toHaveBeenCalled();
    });

    it('should clear all stored files', async () => {
      const mockFiles: ProjectFiles = new Map([['file1.txt', 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      await service.loadProjectFiles();
      service.cleanup();

      const privateService = service as unknown as {
        currentFiles: ProjectFiles | null;
        previousFiles: ProjectFiles | null;
        changedFiles: Map<string, FileChange> | null;
      };
      expect(privateService.currentFiles).toBeNull();
      expect(privateService.previousFiles).toBeNull();
      expect(privateService.changedFiles).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with no extension', async () => {
      const mockFiles: ProjectFiles = new Map([['README', 'readme content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const container = document.createElement('div');
      await service.createFilePreview('README', container);

      const pre = container.querySelector('pre');
      expect(pre?.classList.contains('language-readme')).toBe(true);
    });

    it('should handle empty file content', async () => {
      const mockFiles: ProjectFiles = new Map([['empty.txt', '']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const content = await service.getFileContent('empty.txt');

      expect(content).toBe(null);
    });

    it('should handle files with only newlines', async () => {
      const oldFiles: ProjectFiles = new Map([['test.txt', '\n\n\n']]);
      const newFiles: ProjectFiles = new Map([['test.txt', '\n\n']]);

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(oldFiles);
      await service.loadProjectFiles();

      mockDownloadService.getProjectFiles.mockResolvedValueOnce(newFiles);
      await service.loadProjectFiles(true);

      const diff = await service.getFileDiff('test.txt');
      expect(diff).not.toBeNull();
    });

    it('should handle very long file paths', async () => {
      const longPath = 'a/'.repeat(50) + 'file.txt';
      const mockFiles: ProjectFiles = new Map([[longPath, 'content']]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const content = await service.getFileContent(longPath);
      expect(content).toBe('content');
    });

    it('should handle special characters in file content', async () => {
      const specialContent = '!@#$%^&*()_+{}[]|\\:";\'<>?,./`~';
      const mockFiles: ProjectFiles = new Map([['test.txt', specialContent]]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const content = await service.getFileContent('test.txt');
      expect(content).toBe(specialContent);
    });

    it('should handle unicode characters in file content', async () => {
      const unicodeContent = '你好世界 🌍 Привет мир';
      const mockFiles: ProjectFiles = new Map([['test.txt', unicodeContent]]);
      mockDownloadService.getProjectFiles.mockResolvedValue(mockFiles);

      const content = await service.getFileContent('test.txt');
      expect(content).toBe(unicodeContent);
    });
  });
});
