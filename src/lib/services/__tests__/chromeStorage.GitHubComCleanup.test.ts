import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeStorageService } from '../chromeStorage';

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

interface ChromeNamespace {
  storage: typeof mockChromeStorage;
}

interface GlobalWithChrome {
  chrome: ChromeNamespace;
}

(global as unknown as GlobalWithChrome).chrome = {
  storage: mockChromeStorage,
};

describe('ChromeStorageService - GitHub.com Project Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage.sync.set.mockResolvedValue(undefined);
  });

  describe('cleanupGitHubComProjects', () => {
    it('should remove projects with repoName = "github.com" and return count', async () => {
      const projectSettings = {
        'normal-project': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Normal Project',
        },
        'github-com-project-1': {
          repoName: 'github.com',
          branch: 'main',
          projectTitle: 'Import Project 1',
        },
        'another-normal-project': {
          repoName: 'another-repo',
          branch: 'dev',
          projectTitle: 'Another Normal Project',
        },
        'github-com-project-2': {
          repoName: 'github.com',
          branch: 'main',
          projectTitle: 'Import Project 2',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(2);

      const savedData = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      expect(savedData).toBeDefined();
      expect(savedData?.projectSettings).toEqual({
        'normal-project': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Normal Project',
        },
        'another-normal-project': {
          repoName: 'another-repo',
          branch: 'dev',
          projectTitle: 'Another Normal Project',
        },
      });

      expect(Object.keys(savedData?.projectSettings || {})).toHaveLength(2);
      expect(savedData?.projectSettings?.['github-com-project-1']).toBeUndefined();
      expect(savedData?.projectSettings?.['github-com-project-2']).toBeUndefined();
    });

    it('should return 0 and not modify storage when no github.com projects exist', async () => {
      const projectSettings = {
        'normal-project-1': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Normal Project 1',
        },
        'normal-project-2': {
          repoName: 'another-repo',
          branch: 'dev',
          projectTitle: 'Normal Project 2',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(0);
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should return 0 and not modify storage for empty project settings', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(0);
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle missing projectSettings key and return 0', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(0);
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should propagate chrome storage errors', async () => {
      const storageError = new Error('Storage access denied');
      mockChromeStorage.sync.get.mockRejectedValue(storageError);

      await expect(ChromeStorageService.cleanupGitHubComProjects()).rejects.toThrow(
        'Storage access denied'
      );
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should remove all projects when all are github.com projects', async () => {
      const projectSettings = {
        'temp-project-1': {
          repoName: 'github.com',
          branch: 'main',
          projectTitle: 'Temp Project 1',
        },
        'temp-project-2': {
          repoName: 'github.com',
          branch: 'dev',
          projectTitle: 'Temp Project 2',
        },
        'temp-project-3': {
          repoName: 'github.com',
          branch: 'feature',
          projectTitle: 'Temp Project 3',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(3);

      const savedData = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      expect(savedData).toBeDefined();
      expect(savedData?.projectSettings).toEqual({});
      expect(Object.keys(savedData?.projectSettings || {})).toHaveLength(0);
    });

    it('should preserve projects with null or undefined repoName', async () => {
      const projectSettings = {
        'normal-project': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Normal Project',
        },
        'project-without-repo': {
          branch: 'main',
          projectTitle: 'Project Without Repo',
        },
        'github-com-project': {
          repoName: 'github.com',
          branch: 'main',
          projectTitle: 'GitHub.com Project',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(1);

      const savedData = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      expect(savedData).toBeDefined();
      expect(savedData?.projectSettings).toEqual({
        'normal-project': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Normal Project',
        },
        'project-without-repo': {
          branch: 'main',
          projectTitle: 'Project Without Repo',
        },
      });
      expect(Object.keys(savedData?.projectSettings || {})).toHaveLength(2);
      expect(savedData?.projectSettings?.['project-without-repo']).toBeDefined();
    });

    it('should preserve all project properties when filtering out github.com projects', async () => {
      const projectSettings = {
        'valid-project': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Valid Project',
          customProperty: 'custom-value',
          metadata_last_updated: '2024-01-01T00:00:00.000Z',
        },
        'temp-project': {
          repoName: 'github.com',
          branch: 'main',
          projectTitle: 'Temp',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(1);

      const savedData = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      expect(savedData?.projectSettings?.['valid-project']).toEqual({
        repoName: 'my-repo',
        branch: 'main',
        projectTitle: 'Valid Project',
        customProperty: 'custom-value',
        metadata_last_updated: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should handle storage set errors appropriately', async () => {
      const projectSettings = {
        'github-com-project': {
          repoName: 'github.com',
          branch: 'main',
          projectTitle: 'Temp',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const setError = new Error('Storage write failed');
      mockChromeStorage.sync.set.mockRejectedValue(setError);

      await expect(ChromeStorageService.cleanupGitHubComProjects()).rejects.toThrow(
        'Storage write failed'
      );
    });

    it('should correctly identify github.com projects by exact match only', async () => {
      const projectSettings = {
        'exact-match': {
          repoName: 'github.com',
          branch: 'main',
        },
        'prefix-match': {
          repoName: 'github.com-test',
          branch: 'main',
        },
        'suffix-match': {
          repoName: 'test-github.com',
          branch: 'main',
        },
        'contains-match': {
          repoName: 'test-github.com-test',
          branch: 'main',
        },
        'case-different': {
          repoName: 'GitHub.com',
          branch: 'main',
        },
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings,
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(1);

      const savedData = mockChromeStorage.sync.set.mock.calls[0]?.[0];
      expect(savedData?.projectSettings?.['exact-match']).toBeUndefined();
      expect(savedData?.projectSettings?.['prefix-match']).toBeDefined();
      expect(savedData?.projectSettings?.['suffix-match']).toBeDefined();
      expect(savedData?.projectSettings?.['contains-match']).toBeDefined();
      expect(savedData?.projectSettings?.['case-different']).toBeDefined();
      expect(Object.keys(savedData?.projectSettings || {})).toHaveLength(4);
    });
  });
});
