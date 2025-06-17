import { ChromeStorageService } from '../chromeStorage';

// Mock logger to avoid console output during tests
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock chrome.storage
const mockChromeStorage = {
  sync: {
    get: jest.fn(),
    set: jest.fn(),
  },
  local: {
    get: jest.fn(),
    set: jest.fn(),
  },
};

(global as any).chrome = {
  storage: mockChromeStorage,
};

describe('ChromeStorageService - GitHub.com Project Cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupGitHubComProjects', () => {
    it('should remove projects with repoName = "github.com"', async () => {
      // Setup: Projects with mixed repoNames including github.com
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

      // Execute cleanup
      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      // Verify it returns the correct count
      expect(cleanedCount).toBe(2);

      // Verify chrome.storage.sync.set was called with cleaned projects
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
      // Setup: Only normal projects
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

      // Execute cleanup
      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      // Verify no projects were removed
      expect(cleanedCount).toBe(0);

      // Verify chrome.storage.sync.set was not called since no changes needed
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle empty project settings', async () => {
      // Setup: Empty projectSettings
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      // Execute cleanup
      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      // Verify no projects were removed
      expect(cleanedCount).toBe(0);

      // Verify chrome.storage.sync.set was not called
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle missing projectSettings key', async () => {
      // Setup: No projectSettings key at all
      mockChromeStorage.sync.get.mockResolvedValue({});

      // Execute cleanup
      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      // Verify no projects were removed
      expect(cleanedCount).toBe(0);

      // Verify chrome.storage.sync.set was not called
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle chrome storage errors gracefully', async () => {
      // Setup: Chrome storage get throws error
      const storageError = new Error('Storage access denied');
      mockChromeStorage.sync.get.mockRejectedValue(storageError);

      // Execute cleanup and expect it to throw
      await expect(ChromeStorageService.cleanupGitHubComProjects()).rejects.toThrow(
        'Storage access denied'
      );

      // Verify set was not called
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
    });

    it('should handle all projects being github.com projects', async () => {
      // Setup: All projects are github.com projects
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

      // Execute cleanup
      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      // Verify all projects were removed
      expect(cleanedCount).toBe(3);

      // Verify chrome.storage.sync.set was called with empty projectSettings
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        projectSettings: {},
      });
    });

    it('should preserve projects with null or undefined repoName', async () => {
      // Setup: Projects with missing repoName properties
      const projectSettings = {
        'normal-project': {
          repoName: 'my-repo',
          branch: 'main',
          projectTitle: 'Normal Project',
        },
        'project-without-repo': {
          branch: 'main',
          projectTitle: 'Project Without Repo',
          // repoName is missing
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

      // Execute cleanup
      const cleanedCount = await ChromeStorageService.cleanupGitHubComProjects();

      // Verify only the github.com project was removed
      expect(cleanedCount).toBe(1);

      // Verify the project without repoName was preserved
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
