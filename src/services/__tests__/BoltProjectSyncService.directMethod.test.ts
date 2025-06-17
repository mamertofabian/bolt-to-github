import { BoltProjectSyncService } from '../BoltProjectSyncService';
import { ChromeStorageService } from '$lib/services/chromeStorage';
import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';
import type { BoltProject, ProjectSettings } from '$lib/types';

// Mock dependencies
jest.mock('$lib/services/chromeStorage');
jest.mock('../../content/services/SupabaseAuthService');

describe('BoltProjectSyncService - Direct Method Testing', () => {
  let service: BoltProjectSyncService;
  let mockStorageGet: jest.Mock;
  let mockStorageSet: jest.Mock;
  let mockGetGitHubSettings: jest.Mock;
  let mockSaveGitHubSettings: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup ChromeStorageService mock
    mockStorageGet = jest.fn();
    mockStorageSet = jest.fn();
    ChromeStorageService.prototype.get = mockStorageGet;
    ChromeStorageService.prototype.set = mockStorageSet;

    // Setup static ChromeStorageService methods
    mockGetGitHubSettings = jest.mocked(ChromeStorageService.getGitHubSettings);
    mockSaveGitHubSettings = jest.mocked(ChromeStorageService.saveGitHubSettings);

    // Default mock for auth
    const mockAuthInstance = {
      getAuthState: jest.fn().mockReturnValue({
        isAuthenticated: true,
        subscription: { isActive: true },
      }),
    };
    (SupabaseAuthService.getInstance as jest.Mock).mockReturnValue(mockAuthInstance);

    // Mock chrome storage
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockImplementation((keys) => {
            const result: any = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];

            if (keyArray.includes('lastSettingsUpdate')) {
              result.lastSettingsUpdate = {
                timestamp: Date.now() - 60000, // 1 minute ago by default
                projectId: 'test-project',
              };
            }
            if (keyArray.includes('recentProjectChanges')) {
              result.recentProjectChanges = [];
            }
            return Promise.resolve(result);
          }),
          set: jest.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as typeof chrome;

    service = new BoltProjectSyncService();
  });

  describe('syncBackToActiveStorage', () => {
    it('should skip updating projects with recent user changes', async () => {
      // Mock recent settings update (5 seconds ago)
      const recentTimestamp = Date.now() - 5000;
      (chrome.storage.local.get as jest.Mock).mockImplementation((keys) => {
        if (Array.isArray(keys) && keys.includes('lastSettingsUpdate')) {
          return Promise.resolve({
            lastSettingsUpdate: {
              timestamp: recentTimestamp,
              projectId: 'project-1',
              repoName: 'user-updated-repo',
              branch: 'user-branch',
              projectTitle: 'User Title',
            },
          });
        }
        return Promise.resolve({});
      });

      // Mock existing settings
      const existingSettings: ProjectSettings = {
        'project-1': {
          repoName: 'user-updated-repo',
          branch: 'user-branch',
          projectTitle: 'User Title',
        },
        'project-2': {
          repoName: 'old-repo-2',
          branch: 'main',
        },
      };

      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: existingSettings,
      });

      // Mock bolt projects with different data
      const boltProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'project-1',
          project_name: 'Server Project 1',
          github_repo_name: 'server-repo-1',
          github_branch: 'server-branch',
          last_modified: new Date().toISOString(),
        },
        {
          id: 'project-2',
          bolt_project_id: 'project-2',
          project_name: 'Server Project 2',
          github_repo_name: 'server-repo-2',
          github_branch: 'develop',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects });

      // Call the method directly
      await (service as any).syncBackToActiveStorage();

      // Verify project-1 was preserved (recent change)
      expect(mockSaveGitHubSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          projectSettings: expect.objectContaining({
            'project-1': {
              repoName: 'user-updated-repo', // Preserved
              branch: 'user-branch', // Preserved
              projectTitle: 'User Title', // Preserved
            },
            'project-2': {
              repoName: 'server-repo-2', // Updated from server
              branch: 'develop', // Updated from server
              projectTitle: 'Server Project 2', // Updated from server
            },
          }),
        })
      );
    });

    it('should update all projects when no recent changes exist', async () => {
      // Mock no recent changes
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      const existingSettings: ProjectSettings = {
        'project-1': {
          repoName: 'old-repo-1',
          branch: 'main',
        },
      };

      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: existingSettings,
      });

      const boltProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'project-1',
          project_name: 'New Project 1',
          github_repo_name: 'new-repo-1',
          github_branch: 'develop',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects });

      await (service as any).syncBackToActiveStorage();

      // All projects should be updated
      expect(mockSaveGitHubSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          projectSettings: expect.objectContaining({
            'project-1': {
              repoName: 'new-repo-1',
              branch: 'develop',
              projectTitle: 'New Project 1',
            },
          }),
        })
      );
    });

    it('should handle empty bolt projects gracefully', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      await (service as any).syncBackToActiveStorage();

      // Should not save anything
      expect(mockSaveGitHubSettings).not.toHaveBeenCalled();
    });

    it('should respect the 30-second threshold', async () => {
      const oldTimestamp = Date.now() - 40000; // 40 seconds ago

      (chrome.storage.local.get as jest.Mock).mockImplementation((keys) => {
        if (Array.isArray(keys) && keys.includes('lastSettingsUpdate')) {
          return Promise.resolve({
            lastSettingsUpdate: {
              timestamp: oldTimestamp,
              projectId: 'project-1',
              repoName: 'old-change',
              branch: 'old-branch',
            },
          });
        }
        return Promise.resolve({});
      });

      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {
          'project-1': { repoName: 'old-change', branch: 'old-branch' },
        },
      });

      const boltProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'project-1',
          project_name: 'New Project',
          github_repo_name: 'new-repo',
          github_branch: 'new-branch',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects });

      await (service as any).syncBackToActiveStorage();

      // Old change should be overwritten
      expect(mockSaveGitHubSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          projectSettings: expect.objectContaining({
            'project-1': {
              repoName: 'new-repo',
              branch: 'new-branch',
              projectTitle: 'New Project',
            },
          }),
        })
      );
    });
  });

  describe('getRecentProjectChanges', () => {
    it('should detect recent changes within threshold', async () => {
      const recentTimestamp = Date.now() - 10000; // 10 seconds ago

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        lastSettingsUpdate: {
          timestamp: recentTimestamp,
          projectId: 'project-1',
          repoName: 'recent-repo',
          branch: 'recent-branch',
        },
      });

      const changes = await (service as any).getRecentProjectChanges();

      expect(changes.size).toBe(1);
      expect(changes.has('project-1')).toBe(true);
      expect(changes.get('project-1')).toMatchObject({
        repoName: 'recent-repo',
        branch: 'recent-branch',
      });
    });

    it('should ignore old changes beyond threshold', async () => {
      const oldTimestamp = Date.now() - 40000; // 40 seconds ago

      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        lastSettingsUpdate: {
          timestamp: oldTimestamp,
          projectId: 'project-1',
          repoName: 'old-repo',
        },
      });

      const changes = await (service as any).getRecentProjectChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle missing data gracefully', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      const changes = await (service as any).getRecentProjectChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      (chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const changes = await (service as any).getRecentProjectChanges();

      expect(changes.size).toBe(0);
    });
  });
});
