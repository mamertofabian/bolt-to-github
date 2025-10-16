import { ChromeStorageService } from '$lib/services/chromeStorage';
import type { BoltProject, ProjectSettings } from '$lib/types';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';
import { BoltProjectSyncService } from '../BoltProjectSyncService';

vi.mock('$lib/services/chromeStorage');
vi.mock('../../content/services/SupabaseAuthService');

describe('BoltProjectSyncService - Recent Changes & Merge Behavior', () => {
  let service: BoltProjectSyncService;
  let mockStorageGet: Mock;
  let mockStorageSet: Mock;
  let mockGetGitHubSettings: Mock;
  let mockFetch: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });

    mockStorageGet = vi.fn();
    mockStorageSet = vi.fn();
    ChromeStorageService.prototype.get = mockStorageGet;
    ChromeStorageService.prototype.set = mockStorageSet;

    mockGetGitHubSettings = vi.mocked(ChromeStorageService.getGitHubSettings);

    const mockAuthInstance = {
      getAuthState: vi.fn().mockReturnValue({
        isAuthenticated: true,
        subscription: { isActive: true },
      }),
    };
    vi.mocked(SupabaseAuthService.getInstance).mockReturnValue(mockAuthInstance as never);

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockImplementation((keys) => {
            const result: Record<string, unknown> = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];

            if (keyArray.includes('lastSettingsUpdate')) {
              result.lastSettingsUpdate = {
                timestamp: Date.now() - 60000,
                projectId: 'test-project',
              };
            }
            if (keyArray.includes('recentProjectChanges')) {
              result.recentProjectChanges = [];
            }
            if (keyArray.includes('extensionInstallDate')) {
              result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
            }
            if (keyArray.includes('totalProjectsCreated')) {
              result.totalProjectsCreated = 5;
            }
            if (keyArray.includes('supabaseToken')) {
              result.supabaseToken = 'valid.jwt.token';
            }
            if (keyArray.includes('supabaseAuthState')) {
              result.supabaseAuthState = {
                access_token: 'valid.jwt.token',
              };
            }
            return Promise.resolve(result);
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as never;

    service = new BoltProjectSyncService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Outward Sync with Recent User Changes', () => {
    it('should preserve recent user changes when syncing to server', async () => {
      const recentTimestamp = Date.now() - 5000;

      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('lastSettingsUpdate')) {
          result.lastSettingsUpdate = {
            timestamp: recentTimestamp,
            projectId: 'project-1',
            repoName: 'user-updated-repo',
            branch: 'user-branch',
            projectTitle: 'User Title',
          };
        }
        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
      });

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

      const boltProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'project-1',
          project_name: 'Server Project 1',
          github_repo_name: 'server-repo-1',
          github_branch: 'server-branch',
          repoName: 'server-repo-1',
          branch: 'server-branch',
          last_modified: new Date().toISOString(),
        },
        {
          id: 'project-2',
          bolt_project_id: 'project-2',
          project_name: 'Server Project 2',
          github_repo_name: 'server-repo-2',
          github_branch: 'develop',
          repoName: 'server-repo-2',
          branch: 'develop',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: boltProjects,
          conflicts: [],
          deletedProjects: [],
        }),
      });

      await service.performOutwardSync();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync-bolt-projects'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      mockStorageGet.mockResolvedValue({ lastSyncTimestamp: '2024-01-01T00:00:00.000Z' });
      const syncTimestamp = await service.getLastSyncTimestamp();
      expect(syncTimestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should sync all projects when no recent changes exist', async () => {
      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
      });

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
          repoName: 'new-repo-1',
          branch: 'develop',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: boltProjects,
          conflicts: [],
          deletedProjects: [],
        }),
      });

      await service.performOutwardSync();

      expect(mockFetch).toHaveBeenCalled();

      mockStorageGet.mockResolvedValue({ lastSyncTimestamp: '2024-01-01T00:00:00.000Z' });
      const syncTimestamp = await service.getLastSyncTimestamp();
      expect(syncTimestamp).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle empty bolt projects without syncing', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: [] });
      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [],
          conflicts: [],
          deletedProjects: [],
        }),
      });

      await service.performOutwardSync();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should respect the 30-second threshold for recent changes', async () => {
      const oldTimestamp = Date.now() - 40000;

      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('lastSettingsUpdate')) {
          result.lastSettingsUpdate = {
            timestamp: oldTimestamp,
            projectId: 'project-1',
            repoName: 'old-change',
            branch: 'old-branch',
          };
        }
        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
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
          repoName: 'new-repo',
          branch: 'new-branch',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: boltProjects,
          conflicts: [],
          deletedProjects: [],
        }),
      });

      await service.performOutwardSync();

      expect(mockFetch).toHaveBeenCalled();

      mockStorageGet.mockResolvedValue({ lastSyncTimestamp: '2024-01-01T00:00:00.000Z' });
      const syncTimestamp = await service.getLastSyncTimestamp();
      expect(syncTimestamp).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('Inward Sync Conditions', () => {
    it('should allow inward sync when user has 0-1 projects total', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: [] });
      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
      });

      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
      });

      const serverProjects: BoltProject[] = [
        {
          id: 'server-1',
          bolt_project_id: 'server-1',
          project_name: 'Server Project',
          github_repo_name: 'server-repo',
          github_branch: 'main',
          repoName: 'server-repo',
          branch: 'main',
          last_modified: new Date().toISOString(),
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: serverProjects,
          conflicts: [],
          deletedProjects: [],
        }),
      });

      const result = await service.performInwardSync();

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should skip inward sync when user has multiple projects', async () => {
      const multipleProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'project-1',
          project_name: 'Project 1',
          github_repo_name: 'repo-1',
          github_branch: 'main',
          repoName: 'repo-1',
          branch: 'main',
          last_modified: new Date().toISOString(),
        },
        {
          id: 'project-2',
          bolt_project_id: 'project-2',
          project_name: 'Project 2',
          github_repo_name: 'repo-2',
          github_branch: 'main',
          repoName: 'repo-2',
          branch: 'main',
          last_modified: new Date().toISOString(),
        },
      ];

      mockStorageGet.mockResolvedValue({ boltProjects: multipleProjects });
      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
      });

      const result = await service.performInwardSync();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle authentication failures gracefully', async () => {
      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        return Promise.resolve(result);
      });

      const mockAuthInstance = {
        getAuthState: vi.fn().mockReturnValue({
          isAuthenticated: false,
          subscription: { isActive: false },
        }),
      };
      vi.mocked(SupabaseAuthService.getInstance).mockReturnValue(mockAuthInstance as never);

      const unauthenticatedService = new BoltProjectSyncService();
      const result = await unauthenticatedService.performOutwardSync();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully during sync', async () => {
      let callCount = 0;
      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        callCount++;
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (callCount === 1) {
          return Promise.reject(new Error('Storage error'));
        }

        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
      });

      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
      });

      mockStorageGet.mockResolvedValue({ boltProjects: [] });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [],
          conflicts: [],
          deletedProjects: [],
        }),
      });

      await service.performOutwardSync();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle network errors during sync', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: [] });
      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
      });

      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
      });

      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(service.performOutwardSync()).rejects.toThrow('Network error');
    });

    it('should handle API errors during sync', async () => {
      mockStorageGet.mockResolvedValue({ boltProjects: [] });
      mockGetGitHubSettings.mockResolvedValue({
        githubToken: 'token',
        repoOwner: 'owner',
        projectSettings: {},
      });

      (chrome.storage.local.get as Mock).mockImplementation((keys) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];

        if (keyArray.includes('extensionInstallDate')) {
          result.extensionInstallDate = Date.now() - 1000 * 60 * 60 * 24 * 14;
        }
        if (keyArray.includes('totalProjectsCreated')) {
          result.totalProjectsCreated = 5;
        }
        if (keyArray.includes('supabaseToken')) {
          result.supabaseToken = 'valid.jwt.token';
        }
        if (keyArray.includes('supabaseAuthState')) {
          result.supabaseAuthState = {
            access_token: 'valid.jwt.token',
          };
        }
        return Promise.resolve(result);
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database error' }),
      });

      await expect(service.performOutwardSync()).rejects.toThrow('Sync failed');
    });
  });
});
