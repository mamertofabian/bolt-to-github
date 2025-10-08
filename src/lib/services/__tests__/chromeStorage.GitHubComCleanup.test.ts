/* eslint-disable @typescript-eslint/no-explicit-any */
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

(global as any).chrome = {
  storage: mockChromeStorage,
};

describe('ChromeStorageService - GitHub.com Project Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cleanupGitHubComProjects', () => {
    it('should remove projects with repoName = "github.com"', async () => {
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

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        projectSettings: {
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
        },
      });
    });

    it('should return 0 when no github.com projects exist', async () => {
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

    it('should handle empty project settings', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(0);

      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle missing projectSettings key', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});

      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      expect(cleanedCount).toBe(0);

      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle chrome storage errors gracefully', async () => {
      const storageError = new Error('Storage access denied');
      mockChromeStorage.sync.get.mockRejectedValue(storageError);

      await expect(ChromeStorageService.cleanupGitHubComProjects()).rejects.toThrow(
        'Storage access denied'
      );

      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle all projects being github.com projects', async () => {
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

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        projectSettings: {},
      });
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

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        projectSettings: {
          'normal-project': {
            repoName: 'my-repo',
            branch: 'main',
            projectTitle: 'Normal Project',
          },
          'project-without-repo': {
            branch: 'main',
            projectTitle: 'Project Without Repo',
          },
        },
      });
    });
  });
});
