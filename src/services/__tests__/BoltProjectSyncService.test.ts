import { BoltProjectSyncService } from '../BoltProjectSyncService';
import { ChromeStorageService } from '$lib/services/chromeStorage';
import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';
import type { BoltProject, SyncRequest, SyncResponse } from '$lib/types';

// Mock dependencies
jest.mock('$lib/services/chromeStorage');
jest.mock('../../content/services/SupabaseAuthService');

// Mock fetch
global.fetch = jest.fn();

describe('BoltProjectSyncService', () => {
  let service: BoltProjectSyncService;
  let mockStorageGet: jest.Mock;
  let mockStorageSet: jest.Mock;
  let mockAuthGetToken: jest.Mock;
  let mockAuthGetState: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup ChromeStorageService mock
    mockStorageGet = jest.fn();
    mockStorageSet = jest.fn();
    ChromeStorageService.prototype.get = mockStorageGet;
    ChromeStorageService.prototype.set = mockStorageSet;

    // Setup static ChromeStorageService methods
    jest.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
      githubToken: '',
      repoOwner: '',
      projectSettings: {},
    });
    jest.mocked(ChromeStorageService.saveGitHubSettings).mockResolvedValue(undefined);

    // Setup SupabaseAuthService mock
    mockAuthGetToken = jest.fn();
    mockAuthGetState = jest.fn();
    const mockAuthInstance = {
      getAuthToken: mockAuthGetToken,
      getAuthState: mockAuthGetState,
    };
    (SupabaseAuthService.getInstance as jest.Mock).mockReturnValue(mockAuthInstance);

    // Mock chrome storage for auth token
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({ supabaseToken: 'mock.auth.token' }),
        },
      },
    } as unknown as typeof chrome;

    service = new BoltProjectSyncService();
  });

  describe('getLocalProjects', () => {
    it('should retrieve projects from chrome storage', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'test-project',
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          github_branch: 'main', // Backend field
          is_private: false,
          last_modified: '2024-01-01T00:00:00Z',
          // Local compatibility fields
          repoName: 'test-repo',
          branch: 'main',
          version: 1,
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects: mockProjects });

      const projects = await service.getLocalProjects();

      expect(mockStorageGet).toHaveBeenCalledWith('boltProjects');
      expect(projects).toEqual(mockProjects);
    });

    it('should return empty array if no projects stored', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: null });

      const projects = await service.getLocalProjects();

      expect(projects).toEqual([]);
    });
  });

  describe('saveLocalProjects', () => {
    it('should save projects to chrome storage', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'test-project',
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          github_branch: 'main', // Backend field
          is_private: false,
          last_modified: '2024-01-01T00:00:00Z',
          // Local compatibility fields
          repoName: 'test-repo',
          branch: 'main',
          version: 1,
        },
      ];

      mockStorageSet.mockResolvedValue(undefined);

      await service.saveLocalProjects(mockProjects);

      expect(mockStorageSet).toHaveBeenCalledWith({ boltProjects: mockProjects });
    });
  });

  describe('syncWithBackend', () => {
    const mockToken = 'mock.auth.token';
    const mockProjects: BoltProject[] = [
      {
        id: 'project-1',
        bolt_project_id: 'bolt-1',
        project_name: 'test-project',
        github_repo_name: 'test-repo',
        github_repo_owner: 'test-user',
        is_private: false,
        repoName: 'test-repo',
        branch: 'main',
        last_modified: '2024-01-01T00:00:00Z',
        version: 1,
      },
    ];

    beforeEach(() => {
      mockAuthGetToken.mockResolvedValue(mockToken);
      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });
    });

    it('should sync projects with backend when authenticated', async () => {
      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: mockProjects,
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      mockStorageGet.mockResolvedValue({
        boltProjects: mockProjects,
        lastSyncTimestamp: '2024-01-01T00:00:00Z',
      });

      const result = await service.syncWithBackend();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/sync-bolt-projects'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            localProjects: [
              {
                // Only backend-compatible fields should be sent
                bolt_project_id: 'bolt-1',
                project_name: 'test-project',
                github_repo_owner: 'test-user',
                github_repo_name: 'test-repo',
                is_private: false,
                last_modified: '2024-01-01T00:00:00Z',
                // Local fields should be excluded: id, repoName, branch, version
              },
            ],
            lastSyncTimestamp: '2024-01-01T00:00:00Z',
            conflictResolution: 'auto-resolve',
          }),
        })
      );

      expect(result).toEqual(mockResponse);
      expect(mockStorageSet).toHaveBeenCalledWith({
        boltProjects: mockProjects,
      });
    });

    it('should handle authentication errors', async () => {
      // Mock chrome storage to return no token
      (global.chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      await expect(service.syncWithBackend()).rejects.toThrow('User not authenticated');
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
      mockStorageGet.mockResolvedValue({ boltProjects: mockProjects });

      await expect(service.syncWithBackend()).rejects.toThrow('Network error');
    });

    it('should handle server errors', async () => {
      const errorResponse = {
        error: 'Server error',
        message: 'Internal server error',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => errorResponse,
      });

      mockStorageGet.mockResolvedValue({ boltProjects: mockProjects });

      await expect(service.syncWithBackend()).rejects.toThrow('Sync failed: Server error');
    });

    it('should handle conflicts in sync response', async () => {
      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [
          {
            project: mockProjects[0],
            conflict: 'version_mismatch',
            message: 'Project version mismatch',
          },
        ],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      mockStorageGet.mockResolvedValue({ boltProjects: mockProjects });

      const result = await service.syncWithBackend();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].conflict).toBe('version_mismatch');
    });
  });

  describe('syncProjectsFromLegacyFormat', () => {
    it('should migrate legacy projects to sync format', async () => {
      // Setup: No existing bolt projects
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      // Setup: Legacy projects exist
      jest.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {
          'github-5q8boznj': {
            repoName: 'github-5q8boznj',
            branch: 'main',
            projectTitle: 'github-5q8boznj',
          },
          'project-2': {
            repoName: 'my-project',
            branch: 'develop',
          },
        },
      });

      // Trigger migration by calling performOutwardSync
      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.performOutwardSync();

      // Verify migration occurred - saveLocalProjects should be called with migrated data
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          boltProjects: expect.arrayContaining([
            expect.objectContaining({
              id: 'github-5q8boznj',
              bolt_project_id: 'github-5q8boznj',
              project_name: 'github-5q8boznj',
              github_repo_name: 'github-5q8boznj',
              github_repo_owner: 'test-owner',
              is_private: false,
              repoName: 'github-5q8boznj',
              branch: 'main',
              sync_status: 'pending',
            }),
            expect.objectContaining({
              id: 'project-2',
              bolt_project_id: 'project-2',
              project_name: 'project-2',
              github_repo_name: 'my-project',
              github_repo_owner: 'test-owner',
              is_private: false,
              repoName: 'my-project',
              branch: 'develop',
              sync_status: 'pending',
            }),
          ]),
        })
      );
    });

    it('should update existing bolt projects missing project_name field', async () => {
      // Setup: Existing bolt projects without project_name field
      const incompleteProject = {
        id: 'incomplete-project',
        bolt_project_id: 'incomplete-project',
        // project_name is missing!
        github_repo_name: 'incomplete-repo',
        github_repo_owner: 'test-owner',
        is_private: false,
        repoName: 'incomplete-repo',
        branch: 'main',
      };

      mockStorageGet.mockResolvedValue({
        boltProjects: [incompleteProject],
      });

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.performOutwardSync();

      // Verify that saveLocalProjects was called to update the incomplete project
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          boltProjects: expect.arrayContaining([
            expect.objectContaining({
              id: 'incomplete-project',
              bolt_project_id: 'incomplete-project',
              project_name: 'incomplete-project', // Should be added
              github_repo_name: 'incomplete-repo',
              github_repo_owner: 'test-owner',
              is_private: false,
              repoName: 'incomplete-repo',
              branch: 'main',
            }),
          ]),
        })
      );
    });

    it('should sync only projects that exist in projectSettings', async () => {
      // Setup: Existing bolt projects
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'existing-project',
            bolt_project_id: 'existing-project',
            project_name: 'existing-project',
            github_repo_name: 'existing-repo',
            is_private: false,
          },
        ],
      });

      // Setup: Legacy projects exist (should be migrated if not already in boltProjects)
      jest.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {
          'legacy-project': {
            repoName: 'legacy-repo',
            branch: 'main',
          },
        },
      });

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.performOutwardSync();

      // Verify migration happened - only projects in projectSettings should be saved
      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          boltProjects: [
            expect.objectContaining({
              id: 'legacy-project',
              bolt_project_id: 'legacy-project',
              github_repo_name: 'legacy-repo',
              github_branch: 'main',
            }),
          ],
        })
      );
    });

    it('should handle migration failure gracefully', async () => {
      // Setup: No existing bolt projects
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      // Setup: ChromeStorageService.getGitHubSettings throws
      jest
        .mocked(ChromeStorageService.getGitHubSettings)
        .mockRejectedValue(new Error('Storage error'));

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Should not throw - migration failure should be handled gracefully
      await expect(service.performOutwardSync()).resolves.not.toThrow();
    });
  });

  describe('syncBackToActiveStorage', () => {
    it('should sync bolt projects back to project settings format', async () => {
      // Setup: Bolt projects exist
      const mockBoltProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'test-project-1',
          github_repo_name: 'test-repo-1',
          github_repo_owner: 'test-owner',
          github_branch: 'main', // Backend field
          is_private: false,
          // Local compatibility fields
          repoName: 'test-repo-1',
          branch: 'main',
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          project_name: 'test-project-2',
          github_repo_name: 'test-repo-2',
          github_branch: 'develop', // Backend field
          is_private: true,
          // Local compatibility fields
          repoName: 'test-repo-2',
          branch: 'develop',
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects: mockBoltProjects });

      // Setup: Current active storage
      jest.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {
          'old-project': {
            repoName: 'old-repo',
            branch: 'old-branch',
          },
        },
      });

      const mockSaveGitHubSettings = jest.fn();
      jest
        .mocked(ChromeStorageService.saveGitHubSettings)
        .mockImplementation(mockSaveGitHubSettings);

      // Trigger sync back by calling performInwardSync
      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Mock shouldPerformInwardSync to return true
      const spyShouldPerformInwardSync = jest.spyOn(service, 'shouldPerformInwardSync');
      spyShouldPerformInwardSync.mockResolvedValue(true);

      await service.performInwardSync();

      // Verify that saveGitHubSettings was called with updated project settings
      expect(mockSaveGitHubSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: expect.objectContaining({
            'bolt-1': {
              repoName: 'test-repo-1',
              branch: 'main',
              projectTitle: 'test-project-1', // Uses project_name from BoltProject
            },
            'bolt-2': {
              repoName: 'test-repo-2',
              branch: 'develop',
              projectTitle: 'test-project-2', // Uses project_name from BoltProject
            },
            // Should preserve existing projects
            'old-project': {
              repoName: 'old-repo',
              branch: 'old-branch',
            },
          }),
        })
      );

      spyShouldPerformInwardSync.mockRestore();
    });

    it('should handle reverse sync failure gracefully', async () => {
      // Setup: Bolt projects exist
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            github_repo_name: 'test-repo-1',
            is_private: false,
          },
        ],
      });

      // Setup: ChromeStorageService.getGitHubSettings throws
      jest
        .mocked(ChromeStorageService.getGitHubSettings)
        .mockRejectedValue(new Error('Storage error'));

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Mock shouldPerformInwardSync to return true
      const spyShouldPerformInwardSync = jest.spyOn(service, 'shouldPerformInwardSync');
      spyShouldPerformInwardSync.mockResolvedValue(true);

      // Should not throw - reverse sync failure should be handled gracefully
      await expect(service.performInwardSync()).resolves.not.toThrow();

      spyShouldPerformInwardSync.mockRestore();
    });

    it('should skip reverse sync when no bolt projects exist', async () => {
      // Setup: No bolt projects
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const mockSaveGitHubSettings = jest.fn();
      jest
        .mocked(ChromeStorageService.saveGitHubSettings)
        .mockImplementation(mockSaveGitHubSettings);

      // Mock shouldPerformInwardSync to return true
      const spyShouldPerformInwardSync = jest.spyOn(service, 'shouldPerformInwardSync');
      spyShouldPerformInwardSync.mockResolvedValue(true);

      await service.performInwardSync();

      // Verify that saveGitHubSettings was not called (no projects to sync back)
      expect(mockSaveGitHubSettings).not.toHaveBeenCalled();

      spyShouldPerformInwardSync.mockRestore();
    });
  });

  describe('performOutwardSync', () => {
    it('should only sync if user is authenticated', async () => {
      mockAuthGetState.mockReturnValue({
        isAuthenticated: false,
        user: null,
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      const result = await service.performOutwardSync();

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should perform sync and update last sync timestamp', async () => {
      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [],
        deletedProjects: [],
      };

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      mockAuthGetToken.mockResolvedValue('mock-token');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      mockStorageGet.mockResolvedValue({ boltProjects: [] });
      mockStorageSet.mockResolvedValue(undefined);

      const result = await service.performOutwardSync();

      expect(result).toEqual(mockResponse);
      expect(mockStorageSet).toHaveBeenCalledWith({
        lastSyncTimestamp: expect.any(String),
      });
    });
  });

  describe('shouldPerformInwardSync', () => {
    it('should return true when projects are empty', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should return true when only one project exists without GitHub repo', async () => {
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            github_repo_name: '',
            github_repo_owner: '',
            is_private: false,
            repoName: 'test-repo',
            branch: 'main',
          },
        ],
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should return false when only one project exists with GitHub repo', async () => {
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            github_repo_name: 'test-repo',
            github_repo_owner: 'test-user',
            is_private: false,
            repoName: 'test-repo',
            branch: 'main',
          },
        ],
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(false);
    });

    it('should return false when only one project exists with partial GitHub repo info (repo name only)', async () => {
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            github_repo_name: 'test-repo',
            github_repo_owner: '',
            is_private: false,
            repoName: 'test-repo',
            branch: 'main',
          },
        ],
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should return false when only one project exists with partial GitHub repo info (owner only)', async () => {
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            github_repo_name: '',
            github_repo_owner: 'test-user',
            is_private: false,
            repoName: 'test-repo',
            branch: 'main',
          },
        ],
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should return false when multiple projects exist', async () => {
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            project_name: 'test-project-1',
            github_repo_name: 'test-repo-1',
            is_private: false,
            repoName: 'test-repo-1',
            branch: 'main',
          },
          {
            id: 'project-2',
            bolt_project_id: 'bolt-2',
            project_name: 'test-project-2',
            github_repo_name: 'test-repo-2',
            is_private: false,
            repoName: 'test-repo-2',
            branch: 'main',
          },
        ],
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(false);
    });

    it('should return false when existing projects in current storage format exist', async () => {
      // No sync format projects
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      // Mock existing project settings in current format
      jest.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {
          'github-5q8boznj': {
            repoName: 'github-5q8boznj',
            branch: 'main',
            projectTitle: 'github-5q8boznj',
          },
        },
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(false);
    });

    it('should return true when no existing projects and no sync projects exist', async () => {
      // No sync format projects
      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      // No existing projects in current format
      jest.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
        githubToken: 'test-token',
        repoOwner: 'test-owner',
        projectSettings: {},
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });
  });

  describe('performInwardSync', () => {
    it('should only sync if conditions are met', async () => {
      // Multiple projects exist - should not sync
      mockStorageGet.mockResolvedValue({
        boltProjects: [
          {
            id: '1',
            bolt_project_id: 'bolt-1',
            github_repo_name: 'repo-1',
            is_private: false,
            repoName: 'repo-1',
            branch: 'main',
          },
          {
            id: '2',
            bolt_project_id: 'bolt-2',
            github_repo_name: 'repo-2',
            is_private: false,
            repoName: 'repo-2',
            branch: 'main',
          },
        ],
      });

      const result = await service.performInwardSync();

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should perform inward sync when projects are empty', async () => {
      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            project_name: 'synced-project',
            github_repo_name: 'synced-repo',
            github_repo_owner: 'test-user',
            is_private: false,
            repoName: 'synced-repo',
            branch: 'main',
            last_modified: '2024-01-01T00:00:00Z',
            version: 1,
          },
        ],
        conflicts: [],
        deletedProjects: [],
      };

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        user: {
          id: 'test-user',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        subscription: {
          isActive: false,
          plan: 'free',
        },
      });

      mockAuthGetToken.mockResolvedValue('mock-token');

      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.performInwardSync();

      expect(result).toEqual(mockResponse);
      expect(mockStorageSet).toHaveBeenCalledWith({
        boltProjects: mockResponse.updatedProjects,
      });
    });
  });

  describe('getLastSyncTimestamp', () => {
    it('should retrieve last sync timestamp from storage', async () => {
      const timestamp = '2024-01-01T00:00:00Z';
      mockStorageGet.mockResolvedValue({ lastSyncTimestamp: timestamp });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBe(timestamp);
    });

    it('should return null if no timestamp stored', async () => {
      mockStorageGet.mockResolvedValue({ lastSyncTimestamp: null });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBeNull();
    });
  });

  describe('setLastSyncTimestamp', () => {
    it('should save timestamp to storage', async () => {
      const timestamp = '2024-01-01T00:00:00Z';
      mockStorageSet.mockResolvedValue(undefined);

      await service.setLastSyncTimestamp(timestamp);

      expect(mockStorageSet).toHaveBeenCalledWith({ lastSyncTimestamp: timestamp });
    });
  });
});
