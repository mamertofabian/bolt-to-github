import type { BoltProject, SyncResponse, GitHubSettingsInterface } from '$lib/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoltProjectSyncService } from '../BoltProjectSyncService';
import { ChromeStorageService } from '$lib/services/chromeStorage';
import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';

vi.mock('$lib/services/chromeStorage');
vi.mock('../../content/services/SupabaseAuthService');

global.fetch = vi.fn();

describe('BoltProjectSyncService', () => {
  let service: BoltProjectSyncService;
  let mockAuthService: {
    getAuthState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });

    vi.mocked(ChromeStorageService.prototype.get).mockResolvedValue({});
    vi.mocked(ChromeStorageService.prototype.set).mockResolvedValue(undefined);
    vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
      githubToken: '',
      repoOwner: '',
      projectSettings: {},
    });
    vi.mocked(ChromeStorageService.saveGitHubSettings).mockResolvedValue(undefined);

    mockAuthService = {
      getAuthState: vi.fn().mockReturnValue({
        isAuthenticated: false,
        user: null,
        subscription: { isActive: false, plan: 'free' },
      }),
    };
    vi.mocked(SupabaseAuthService.getInstance).mockReturnValue(
      mockAuthService as never as SupabaseAuthService
    );

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as never as typeof chrome;

    service = new BoltProjectSyncService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupAuthenticatedUser(token: string = 'mock.auth.token') {
    mockAuthService.getAuthState.mockReturnValue({
      isAuthenticated: true,
      user: {
        id: 'test-user',
        email: 'test@example.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      subscription: { isActive: false, plan: 'free' },
    });
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ supabaseToken: token } as never);
  }

  function setupBoltProjects(projects: BoltProject[]) {
    vi.mocked(ChromeStorageService.prototype.get).mockResolvedValue({
      boltProjects: projects,
    });
  }

  function setupGitHubSettings(settings: Partial<GitHubSettingsInterface> = {}) {
    const defaultSettings: GitHubSettingsInterface = {
      githubToken: 'ghp_test',
      repoOwner: 'test-owner',
      projectSettings: {},
      ...settings,
    };
    vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(defaultSettings);
  }

  function createMockProject(overrides: Partial<BoltProject> = {}): BoltProject {
    return {
      id: 'project-1',
      bolt_project_id: 'bolt-1',
      project_name: 'Test Project',
      github_repo_name: 'test-repo',
      github_repo_owner: 'test-user',
      github_branch: 'main',
      is_private: false,
      last_modified: '2024-01-01T00:00:00Z',
      repoName: 'test-repo',
      branch: 'main',
      version: 1,
      ...overrides,
    };
  }

  describe('Local Project Storage', () => {
    it('should save projects to storage', async () => {
      const project = createMockProject();

      await service.saveLocalProjects([project]);

      expect(ChromeStorageService.prototype.set).toHaveBeenCalledWith({
        boltProjects: [project],
      });
    });

    it('should retrieve projects from storage', async () => {
      const project = createMockProject();
      setupBoltProjects([project]);

      const projects = await service.getLocalProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].project_name).toBe('Test Project');
      expect(projects[0].github_repo_name).toBe('test-repo');
    });

    it('should return empty array when no projects exist', async () => {
      vi.mocked(ChromeStorageService.prototype.get).mockResolvedValue({ boltProjects: null });

      const projects = await service.getLocalProjects();

      expect(projects).toEqual([]);
    });

    it('should handle storage errors gracefully when retrieving', async () => {
      vi.mocked(ChromeStorageService.prototype.get).mockRejectedValue(new Error('Storage error'));

      const projects = await service.getLocalProjects();

      expect(projects).toEqual([]);
    });

    it('should propagate errors when saving fails', async () => {
      vi.mocked(ChromeStorageService.prototype.set).mockRejectedValue(new Error('Save error'));

      await expect(service.saveLocalProjects([createMockProject()])).rejects.toThrow('Save error');
    });

    it('should save sync timestamp to storage', async () => {
      const timestamp = '2024-01-01T12:00:00Z';

      await service.setLastSyncTimestamp(timestamp);

      expect(ChromeStorageService.prototype.set).toHaveBeenCalledWith({
        lastSyncTimestamp: timestamp,
      });
    });

    it('should retrieve sync timestamp from storage', async () => {
      const timestamp = '2024-01-01T12:00:00Z';
      vi.mocked(ChromeStorageService.prototype.get).mockResolvedValue({
        lastSyncTimestamp: timestamp,
      });

      const retrieved = await service.getLastSyncTimestamp();

      expect(retrieved).toBe(timestamp);
    });

    it('should return null when no sync timestamp exists', async () => {
      vi.mocked(ChromeStorageService.prototype.get).mockResolvedValue({
        lastSyncTimestamp: null,
      });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBeNull();
    });

    it('should handle errors gracefully when retrieving timestamp', async () => {
      vi.mocked(ChromeStorageService.prototype.get).mockRejectedValue(new Error('Storage error'));

      const result = await service.getLastSyncTimestamp();

      expect(result).toBeNull();
    });
  });

  describe('Backend Synchronization', () => {
    beforeEach(() => {
      setupAuthenticatedUser();
    });

    it('should sync projects with backend successfully', async () => {
      const project = createMockProject();
      setupBoltProjects([project]);

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [project],
        conflicts: [],
        deletedProjects: [],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as never);

      const result = await service.syncWithBackend();

      expect(result.success).toBe(true);
      expect(result.updatedProjects).toHaveLength(1);
      expect(result.updatedProjects[0].project_name).toBe('Test Project');
    });

    it('should reject sync when user is not authenticated', async () => {
      mockAuthService.getAuthState.mockReturnValue({
        isAuthenticated: false,
        user: null,
        subscription: { isActive: false, plan: 'free' },
      });
      vi.mocked(chrome.storage.local.get).mockResolvedValue({} as never);

      await expect(service.syncWithBackend()).rejects.toThrow('User not authenticated');
    });

    it('should handle network errors during sync', async () => {
      setupBoltProjects([createMockProject()]);
      vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(service.syncWithBackend()).rejects.toThrow('Network error');
    });

    it('should handle server errors during sync', async () => {
      setupBoltProjects([createMockProject()]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      } as never);

      await expect(service.syncWithBackend()).rejects.toThrow('Sync failed: Server error');
    });

    it('should return conflicts when server reports them', async () => {
      const project = createMockProject();
      setupBoltProjects([project]);

      const mockResponse: SyncResponse = {
        success: true,
        updatedProjects: [],
        conflicts: [
          {
            project,
            conflict: 'version_mismatch',
            message: 'Project version mismatch',
          },
        ],
        deletedProjects: [],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as never);

      const result = await service.syncWithBackend();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].conflict).toBe('version_mismatch');
    });

    it('should update local storage with server response when requested', async () => {
      const serverProject = createMockProject({ project_name: 'Updated Project' });
      setupBoltProjects([]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [serverProject],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      await service.syncWithBackend('auto-resolve', true);

      expect(ChromeStorageService.prototype.set).toHaveBeenCalledWith({
        boltProjects: [serverProject],
      });
    });

    it('should not update local storage when not requested', async () => {
      const serverProject = createMockProject({ project_name: 'Server Project' });
      setupBoltProjects([createMockProject({ project_name: 'Local Project' })]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [serverProject],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      await service.syncWithBackend('auto-resolve', false);

      const savedProjects = await service.getLocalProjects();
      expect(savedProjects[0].project_name).toBe('Local Project');
    });

    it('should filter out invalid project IDs before syncing', async () => {
      const validProject = createMockProject({ bolt_project_id: 'valid-project' });
      const invalidProject = createMockProject({ bolt_project_id: 'github.com' });
      setupBoltProjects([validProject, invalidProject]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [validProject],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      await service.syncWithBackend();

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as never as string);
      expect(requestBody.localProjects).toHaveLength(1);
      expect(requestBody.localProjects[0].bolt_project_id).toBe('valid-project');
    });

    it('should include last sync timestamp in request', async () => {
      const timestamp = '2024-01-01T12:00:00Z';
      setupBoltProjects([createMockProject()]);
      vi.mocked(ChromeStorageService.prototype.get).mockResolvedValue({
        boltProjects: [createMockProject()],
        lastSyncTimestamp: timestamp,
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      await service.syncWithBackend();

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as never as string);
      expect(requestBody.lastSyncTimestamp).toBe(timestamp);
    });
  });

  describe('Sync Decision Logic', () => {
    it('should allow inward sync when no projects exist', async () => {
      setupGitHubSettings({ projectSettings: {} });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should allow inward sync when only one project exists', async () => {
      setupBoltProjects([createMockProject()]);
      setupGitHubSettings({ projectSettings: {} });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });

    it('should prevent inward sync when multiple projects exist', async () => {
      setupBoltProjects([
        createMockProject({ bolt_project_id: 'project-1' }),
        createMockProject({ bolt_project_id: 'project-2' }),
      ]);
      setupGitHubSettings({ projectSettings: {} });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(false);
    });

    it('should count projects across both storage formats', async () => {
      setupGitHubSettings({
        projectSettings: {
          'project-1': { repoName: 'repo-1', branch: 'main' },
          'project-2': { repoName: 'repo-2', branch: 'main' },
        },
      });

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(false);
    });

    it('should handle storage errors gracefully', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));

      const result = await service.shouldPerformInwardSync();

      expect(result).toBe(true);
    });
  });

  describe('Outward Sync (Extension to Server)', () => {
    it('should skip sync when user is not authenticated', async () => {
      const result = await service.performOutwardSync();

      expect(result).toBeNull();
    });

    it('should perform sync and update timestamp when authenticated', async () => {
      setupAuthenticatedUser();
      setupBoltProjects([createMockProject()]);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      const result = await service.performOutwardSync();

      expect(result?.success).toBe(true);
      expect(ChromeStorageService.prototype.set).toHaveBeenCalledWith({
        lastSyncTimestamp: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should migrate legacy projects before syncing', async () => {
      setupAuthenticatedUser();
      setupGitHubSettings({
        projectSettings: {
          'legacy-project': { repoName: 'legacy-repo', branch: 'main' },
        },
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      await service.performOutwardSync();

      const setCalls = vi.mocked(ChromeStorageService.prototype.set).mock.calls;
      const migratedProjectCall = setCalls.find((call) => call[0]?.boltProjects);

      expect(migratedProjectCall).toBeDefined();
      const migratedProjects = migratedProjectCall![0].boltProjects as BoltProject[];
      expect(migratedProjects.some((p) => p.bolt_project_id === 'legacy-project')).toBe(true);
    });

    it('should handle sync failures', async () => {
      setupAuthenticatedUser();
      setupBoltProjects([createMockProject()]);
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      await expect(service.performOutwardSync()).rejects.toThrow();
    });
  });

  describe('Inward Sync (Server to Extension)', () => {
    it('should skip sync when conditions not met', async () => {
      setupBoltProjects([createMockProject(), createMockProject({ bolt_project_id: 'project-2' })]);
      setupGitHubSettings({ projectSettings: {} });

      const result = await service.performInwardSync();

      expect(result).toBeNull();
    });

    it('should skip sync when user not authenticated', async () => {
      setupGitHubSettings({ projectSettings: {} });

      const result = await service.performInwardSync();

      expect(result).toBeNull();
    });

    it('should perform sync when authenticated with empty projects', async () => {
      setupAuthenticatedUser();
      setupBoltProjects([]);
      setupGitHubSettings({ projectSettings: {} });

      const serverProject = createMockProject({ project_name: 'Server Project' });
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [serverProject],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      const result = await service.performInwardSync();

      expect(result?.success).toBe(true);
      expect(ChromeStorageService.prototype.set).toHaveBeenCalledWith({
        lastSyncTimestamp: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should merge server projects with existing local projects', async () => {
      setupAuthenticatedUser();
      const localProject = createMockProject({ bolt_project_id: 'local-1', project_name: 'Local' });
      setupBoltProjects([localProject]);
      setupGitHubSettings({ projectSettings: {} });

      const serverProject = createMockProject({
        bolt_project_id: 'server-1',
        project_name: 'Server',
      });
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          updatedProjects: [serverProject],
          conflicts: [],
          deletedProjects: [],
        }),
      } as never);

      await service.performInwardSync();

      const setCalls = vi.mocked(ChromeStorageService.prototype.set).mock.calls;
      const finalProjectCall = setCalls.filter((call) => call[0]?.boltProjects).pop();

      expect(finalProjectCall).toBeDefined();
      const finalProjects = finalProjectCall![0].boltProjects as BoltProject[];
      expect(finalProjects).toHaveLength(2);
      expect(finalProjects.some((p) => p.bolt_project_id === 'local-1')).toBe(true);
      expect(finalProjects.some((p) => p.bolt_project_id === 'server-1')).toBe(true);
    });
  });
});
