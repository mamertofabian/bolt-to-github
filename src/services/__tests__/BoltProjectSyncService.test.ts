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
  let mockStorage: jest.Mocked<ChromeStorageService>;
  let mockAuth: jest.Mocked<SupabaseAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BoltProjectSyncService();
    mockStorage = ChromeStorageService as jest.Mocked<ChromeStorageService>;
    mockAuth = SupabaseAuthService.getInstance() as jest.Mocked<SupabaseAuthService>;
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

      mockStorage.get.mockResolvedValue({ boltProjects: mockProjects });

      const projects = await service.getLocalProjects();

      expect(mockStorage.get).toHaveBeenCalledWith('boltProjects');
      expect(projects).toEqual(mockProjects);
    });

    it('should return empty array if no projects stored', async () => {
      mockStorage.get.mockResolvedValue({ boltProjects: null });

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

      mockStorage.set.mockResolvedValue(undefined);

      await service.saveLocalProjects(mockProjects);

      expect(mockStorage.set).toHaveBeenCalledWith({ boltProjects: mockProjects });
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
      mockAuth.getAuthToken.mockResolvedValue(mockToken);
      mockAuth.getAuthState.mockReturnValue({
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

      mockStorage.get.mockResolvedValue({
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
      expect(mockStorage.set).toHaveBeenCalledWith({
        boltProjects: mockProjects,
      });
    });

    it('should handle authentication errors', async () => {
      mockAuth.getAuthToken.mockResolvedValue(null);

      await expect(service.syncWithBackend()).rejects.toThrow('User not authenticated');
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
      mockStorage.get.mockResolvedValue({ boltProjects: mockProjects });

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

      mockStorage.get.mockResolvedValue({ boltProjects: mockProjects });

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

      mockStorage.get.mockResolvedValue({ boltProjects: mockProjects });

      const result = await service.syncWithBackend();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].conflict).toBe('version_mismatch');
    });
  });

  describe('performOutwardSync', () => {
    it('should only sync if user is authenticated', async () => {
      mockAuth.getAuthState.mockReturnValue({
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

      mockAuth.getAuthState.mockReturnValue({
        isAuthenticated: true,
        userId: 'test-user',
        email: 'test@example.com',
      });

      mockAuth.getAuthToken.mockResolvedValue('mock-token');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      mockStorage.get.mockResolvedValue({ boltProjects: [] });
      mockStorage.set.mockResolvedValue(undefined);

      const result = await service.performOutwardSync();

      expect(result).toEqual(mockResponse);
      expect(mockStorage.set).toHaveBeenCalledWith({
        lastSyncTimestamp: expect.any(String),
      });
    });
  });

  describe('shouldPerformInwardSync', () => {
    it('should return true when projects are empty', async () => {
      mockStorage.get.mockResolvedValue({ boltProjects: [] });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should return true when only one project exists', async () => {
      mockStorage.get.mockResolvedValue({
        boltProjects: [
          {
            id: 'project-1',
            bolt_project_id: 'bolt-1',
            github_repo_name: 'test-repo',
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
      mockStorage.get.mockResolvedValue({
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
      mockStorage.get.mockResolvedValue({
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

      mockAuth.getAuthState.mockReturnValue({
        isAuthenticated: true,
        userId: 'test-user',
        email: 'test@example.com',
      });

      mockAuth.getAuthToken.mockResolvedValue('mock-token');

      mockStorage.get.mockResolvedValue({ boltProjects: [] });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.performInwardSync();

      expect(result).toEqual(mockResponse);
      expect(mockStorage.set).toHaveBeenCalledWith({
        boltProjects: mockResponse.updatedProjects,
      });
    });
  });

  describe('getLastSyncTimestamp', () => {
    it('should retrieve last sync timestamp from storage', async () => {
      const timestamp = '2024-01-01T00:00:00Z';
      mockStorage.get.mockResolvedValue({ lastSyncTimestamp: timestamp });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBe(timestamp);
    });

    it('should return null if no timestamp stored', async () => {
      mockStorage.get.mockResolvedValue({ lastSyncTimestamp: null });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBeNull();
    });
  });

  describe('setLastSyncTimestamp', () => {
    it('should save timestamp to storage', async () => {
      const timestamp = '2024-01-01T00:00:00Z';
      mockStorage.set.mockResolvedValue(undefined);

      await service.setLastSyncTimestamp(timestamp);

      expect(mockStorage.set).toHaveBeenCalledWith({ lastSyncTimestamp: timestamp });
    });
  });
});
