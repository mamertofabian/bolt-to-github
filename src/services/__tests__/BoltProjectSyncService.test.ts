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

    // Setup SupabaseAuthService mock
    mockAuthGetToken = jest.fn();
    mockAuthGetState = jest.fn();
    const mockAuthInstance = {
      getAuthToken: mockAuthGetToken,
      getAuthState: mockAuthGetState,
    };
    (SupabaseAuthService.getInstance as jest.Mock).mockReturnValue(mockAuthInstance);

    service = new BoltProjectSyncService();
  });

  describe('getLocalProjects', () => {
    it('should retrieve projects from chrome storage', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          is_private: false,
          repoName: 'test-repo',
          branch: 'main',
          last_modified: '2024-01-01T00:00:00Z',
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
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          is_private: false,
          repoName: 'test-repo',
          branch: 'main',
          last_modified: '2024-01-01T00:00:00Z',
          version: 1,
        },
      ];

      mockStorageSet.mockResolvedValue(undefined);

      await service.saveLocalProjects(mockProjects);

      expect(mockStorageSet).toHaveBeenCalledWith({ boltProjects: mockProjects });
    });
  });

  describe('syncWithBackend', () => {
    const mockToken = 'mock-auth-token';
    const mockProjects: BoltProject[] = [
      {
        id: 'project-1',
        bolt_project_id: 'bolt-1',
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
        userId: 'test-user',
        email: 'test@example.com',
      });
    });

    it('should sync projects with backend when authenticated', async () => {
      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: mockProjects,
        conflicts: [],
        deletedProjectIds: [],
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
            localProjects: mockProjects,
            lastSyncTimestamp: '2024-01-01T00:00:00Z',
            conflictResolution: 'auto-resolve',
          } as SyncRequest),
        })
      );

      expect(result).toEqual(mockResponse);
      expect(mockStorageSet).toHaveBeenCalledWith({
        boltProjects: mockProjects,
      });
    });

    it('should handle authentication errors', async () => {
      mockAuthGetToken.mockResolvedValue(null);

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
        deletedProjectIds: [],
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

  describe('performOutwardSync', () => {
    it('should only sync if user is authenticated', async () => {
      mockAuthGetState.mockReturnValue({
        isAuthenticated: false,
        userId: null,
        email: null,
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
        deletedProjectIds: [],
      };

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        userId: 'test-user',
        email: 'test@example.com',
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
            github_repo_name: 'test-repo-1',
            is_private: false,
            repoName: 'test-repo-1',
            branch: 'main',
          },
          {
            id: 'project-2',
            bolt_project_id: 'bolt-2',
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
        deletedProjectIds: [],
      };

      mockAuthGetState.mockReturnValue({
        isAuthenticated: true,
        userId: 'test-user',
        email: 'test@example.com',
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
