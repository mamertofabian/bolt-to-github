import type { BoltProject } from '$lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeStorageService } from '../chromeStorage';

const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
};

global.chrome = {
  storage: mockStorage,
  runtime: {
    lastError: undefined,
  },
} as unknown as typeof chrome;

describe('ChromeStorageService - BoltProjects', () => {
  let service: ChromeStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChromeStorageService();

    chrome.runtime.lastError = undefined;
  });

  describe('getBoltProjects', () => {
    it('should retrieve bolt projects from chrome.storage.local', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          project_name: 'Test Project',
          project_description: 'Test repository',
          is_private: false,
          repoName: 'test-repo',
          branch: 'main',
          projectTitle: 'Test Project',
          last_modified: '2024-01-01T00:00:00Z',
          version: 1,
          sync_status: 'synced',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: mockProjects });
      });

      const result = await service.getBoltProjects();

      expect(result).toEqual(mockProjects);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-1');
      expect(result[0].github_repo_name).toBe('test-repo');
      expect(result[0].sync_status).toBe('synced');
    });

    it('should retrieve multiple bolt projects with correct properties', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          github_repo_name: 'test-repo-1',
          github_repo_owner: 'user-1',
          project_name: 'Project 1',
          is_private: false,
          repoName: 'test-repo-1',
          branch: 'main',
          version: 1,
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          github_repo_name: 'test-repo-2',
          github_repo_owner: 'user-2',
          project_name: 'Project 2',
          is_private: true,
          repoName: 'test-repo-2',
          branch: 'develop',
          version: 2,
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: mockProjects });
      });

      const result = await service.getBoltProjects();

      expect(result).toHaveLength(2);
      expect(result[0].is_private).toBe(false);
      expect(result[1].is_private).toBe(true);
      expect(result[0].version).toBe(1);
      expect(result[1].version).toBe(2);
      expect(result.map((p) => p.id)).toEqual(['project-1', 'project-2']);
    });

    it('should return empty array if no projects stored', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const result = await service.getBoltProjects();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle chrome storage errors', async () => {
      chrome.runtime.lastError = { message: 'Storage error' };
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await expect(service.getBoltProjects()).rejects.toThrow('Storage error');
    });
  });

  describe('saveBoltProjects', () => {
    it('should save bolt projects to chrome.storage.local', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Test Project',
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          is_private: false,
          repoName: 'test-repo',
          branch: 'main',
          last_modified: '2024-01-01T00:00:00Z',
          version: 1,
        },
      ];

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.saveBoltProjects(mockProjects);

      expect(savedData).toBeDefined();
      expect(savedData?.boltProjects).toEqual(mockProjects);
      expect(savedData?.boltProjects).toHaveLength(1);
      expect(savedData?.boltProjects[0].id).toBe('project-1');
    });

    it('should save multiple projects with all properties intact', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Project 1',
          github_repo_name: 'repo-1',
          github_repo_owner: 'owner-1',
          is_private: false,
          repoName: 'repo-1',
          branch: 'main',
          version: 1,
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          project_name: 'Project 2',
          github_repo_name: 'repo-2',
          github_repo_owner: 'owner-2',
          is_private: true,
          repoName: 'repo-2',
          branch: 'develop',
          version: 2,
          sync_status: 'pending',
        },
      ];

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.saveBoltProjects(mockProjects);

      expect(savedData?.boltProjects).toHaveLength(2);
      expect(savedData?.boltProjects[0].is_private).toBe(false);
      expect(savedData?.boltProjects[1].is_private).toBe(true);
      expect(savedData?.boltProjects[1].sync_status).toBe('pending');
    });

    it('should save empty array without errors', async () => {
      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.saveBoltProjects([]);

      expect(savedData?.boltProjects).toEqual([]);
      expect(savedData?.boltProjects).toHaveLength(0);
    });

    it('should handle chrome storage errors', async () => {
      chrome.runtime.lastError = { message: 'Storage error' };
      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      await expect(service.saveBoltProjects([])).rejects.toThrow('Storage error');
    });
  });

  describe('getBoltProject', () => {
    it('should retrieve a specific bolt project by id', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Test Project 1',
          github_repo_name: 'test-repo-1',
          is_private: false,
          repoName: 'test-repo-1',
          branch: 'main',
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          project_name: 'Test Project 2',
          github_repo_name: 'test-repo-2',
          is_private: true,
          repoName: 'test-repo-2',
          branch: 'develop',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: mockProjects });
      });

      const result = await service.getBoltProject('project-2');

      expect(result).toEqual(mockProjects[1]);
      expect(result?.id).toBe('project-2');
      expect(result?.is_private).toBe(true);
      expect(result?.branch).toBe('develop');
    });

    it('should retrieve first project when multiple exist', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'first-project',
          bolt_project_id: 'bolt-1',
          project_name: 'First',
          github_repo_name: 'repo-1',
          is_private: false,
          repoName: 'repo-1',
          branch: 'main',
        },
        {
          id: 'second-project',
          bolt_project_id: 'bolt-2',
          project_name: 'Second',
          github_repo_name: 'repo-2',
          is_private: true,
          repoName: 'repo-2',
          branch: 'dev',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: mockProjects });
      });

      const result = await service.getBoltProject('first-project');

      expect(result).not.toBeNull();
      expect(result?.project_name).toBe('First');
      expect(result?.is_private).toBe(false);
    });

    it('should return null if project not found', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      const result = await service.getBoltProject('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when searching in empty projects list', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      const result = await service.getBoltProject('any-id');

      expect(result).toBeNull();
    });

    it('should handle storage errors gracefully', async () => {
      chrome.runtime.lastError = { message: 'Storage read error' };
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await expect(service.getBoltProject('project-1')).rejects.toThrow('Storage read error');
    });
  });

  describe('updateBoltProject', () => {
    it('should update an existing bolt project', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Test Project 1',
          github_repo_name: 'test-repo-1',
          is_private: false,
          repoName: 'test-repo-1',
          branch: 'main',
          version: 1,
        },
      ];

      const updatedProject: Partial<BoltProject> = {
        github_repo_name: 'updated-repo',
        repoName: 'updated-repo',
        version: 2,
        sync_status: 'synced',
      };

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.updateBoltProject('project-1', updatedProject);

      expect(savedData?.boltProjects).toHaveLength(1);
      expect(savedData?.boltProjects[0].id).toBe('project-1');
      expect(savedData?.boltProjects[0].github_repo_name).toBe('updated-repo');
      expect(savedData?.boltProjects[0].repoName).toBe('updated-repo');
      expect(savedData?.boltProjects[0].version).toBe(2);
      expect(savedData?.boltProjects[0].sync_status).toBe('synced');
      expect(savedData?.boltProjects[0].project_name).toBe('Test Project 1');
    });

    it('should update multiple properties while preserving others', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Original Name',
          github_repo_name: 'original-repo',
          github_repo_owner: 'original-owner',
          is_private: false,
          repoName: 'original-repo',
          branch: 'main',
          version: 1,
        },
      ];

      const updates: Partial<BoltProject> = {
        branch: 'develop',
        is_private: true,
      };

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.updateBoltProject('project-1', updates);

      expect(savedData?.boltProjects[0].branch).toBe('develop');
      expect(savedData?.boltProjects[0].is_private).toBe(true);
      expect(savedData?.boltProjects[0].project_name).toBe('Original Name');
      expect(savedData?.boltProjects[0].github_repo_owner).toBe('original-owner');
    });

    it('should update correct project when multiple exist', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Project 1',
          github_repo_name: 'repo-1',
          is_private: false,
          repoName: 'repo-1',
          branch: 'main',
          version: 1,
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          project_name: 'Project 2',
          github_repo_name: 'repo-2',
          is_private: false,
          repoName: 'repo-2',
          branch: 'main',
          version: 1,
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.updateBoltProject('project-2', { version: 5 });

      expect(savedData?.boltProjects).toHaveLength(2);
      expect(savedData?.boltProjects[0].version).toBe(1);
      expect(savedData?.boltProjects[1].version).toBe(5);
      expect(savedData?.boltProjects[1].id).toBe('project-2');
    });

    it('should throw error if project not found', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      await expect(service.updateBoltProject('non-existent', { version: 2 })).rejects.toThrow(
        'Project with id non-existent not found'
      );
    });

    it('should throw descriptive error with project id when not found', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'existing-project',
          bolt_project_id: 'bolt-1',
          project_name: 'Existing',
          github_repo_name: 'repo',
          is_private: false,
          repoName: 'repo',
          branch: 'main',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      await expect(service.updateBoltProject('missing-project', { version: 2 })).rejects.toThrow(
        'Project with id missing-project not found'
      );
    });
  });

  describe('deleteBoltProject', () => {
    it('should delete a bolt project by id', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Test Project 1',
          github_repo_name: 'test-repo-1',
          is_private: false,
          repoName: 'test-repo-1',
          branch: 'main',
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          project_name: 'Test Project 2',
          github_repo_name: 'test-repo-2',
          is_private: true,
          repoName: 'test-repo-2',
          branch: 'develop',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.deleteBoltProject('project-1');

      expect(savedData?.boltProjects).toHaveLength(1);
      expect(savedData?.boltProjects[0].id).toBe('project-2');
      expect(savedData?.boltProjects[0].project_name).toBe('Test Project 2');
      expect(savedData?.boltProjects.some((p) => p.id === 'project-1')).toBe(false);
    });

    it('should delete only the specified project', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          project_name: 'Project 1',
          github_repo_name: 'repo-1',
          is_private: false,
          repoName: 'repo-1',
          branch: 'main',
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
          project_name: 'Project 2',
          github_repo_name: 'repo-2',
          is_private: true,
          repoName: 'repo-2',
          branch: 'develop',
        },
        {
          id: 'project-3',
          bolt_project_id: 'bolt-3',
          project_name: 'Project 3',
          github_repo_name: 'repo-3',
          is_private: false,
          repoName: 'repo-3',
          branch: 'feature',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.deleteBoltProject('project-2');

      expect(savedData?.boltProjects).toHaveLength(2);
      expect(savedData?.boltProjects.map((p) => p.id)).toEqual(['project-1', 'project-3']);
      expect(savedData?.boltProjects.some((p) => p.id === 'project-2')).toBe(false);
    });

    it('should result in empty array when deleting last project', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'last-project',
          bolt_project_id: 'bolt-1',
          project_name: 'Last Project',
          github_repo_name: 'repo',
          is_private: false,
          repoName: 'repo',
          branch: 'main',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.deleteBoltProject('last-project');

      expect(savedData?.boltProjects).toEqual([]);
      expect(savedData?.boltProjects).toHaveLength(0);
    });

    it('should not throw error if project not found', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await service.deleteBoltProject('non-existent');

      expect(savedData?.boltProjects).toEqual([]);
    });

    it('should handle deletion when project list is empty', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      let savedData: { boltProjects: BoltProject[] } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { boltProjects: BoltProject[] };
        callback?.();
      });

      await expect(service.deleteBoltProject('any-id')).resolves.not.toThrow();
      expect(savedData?.boltProjects).toEqual([]);
    });
  });

  describe('getLastSyncTimestamp', () => {
    it('should retrieve last sync timestamp', async () => {
      const timestamp = '2024-01-01T00:00:00Z';

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ lastSyncTimestamp: timestamp });
      });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBe(timestamp);
      expect(typeof result).toBe('string');
    });

    it('should retrieve ISO timestamp format correctly', async () => {
      const timestamp = '2024-12-25T15:30:45.123Z';

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ lastSyncTimestamp: timestamp });
      });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBe(timestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return null if no timestamp stored', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBeNull();
    });

    it('should handle storage errors gracefully', async () => {
      chrome.runtime.lastError = { message: 'Storage read error' };
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await expect(service.getLastSyncTimestamp()).rejects.toThrow('Storage read error');
    });
  });

  describe('setLastSyncTimestamp', () => {
    it('should save last sync timestamp', async () => {
      const timestamp = '2024-01-01T00:00:00Z';

      let savedData: { lastSyncTimestamp: string } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { lastSyncTimestamp: string };
        callback?.();
      });

      await service.setLastSyncTimestamp(timestamp);

      expect(savedData?.lastSyncTimestamp).toBe(timestamp);
      expect(typeof savedData?.lastSyncTimestamp).toBe('string');
    });

    it('should save ISO timestamp with milliseconds', async () => {
      const timestamp = '2024-06-15T08:45:30.500Z';

      let savedData: { lastSyncTimestamp: string } | undefined;
      mockStorage.local.set.mockImplementation((data, callback) => {
        savedData = data as { lastSyncTimestamp: string };
        callback?.();
      });

      await service.setLastSyncTimestamp(timestamp);

      expect(savedData?.lastSyncTimestamp).toBe(timestamp);
      expect(savedData?.lastSyncTimestamp).toContain('.500Z');
    });

    it('should handle storage errors when setting timestamp', async () => {
      chrome.runtime.lastError = { message: 'Storage write error' };
      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      await expect(service.setLastSyncTimestamp('2024-01-01T00:00:00Z')).rejects.toThrow(
        'Storage write error'
      );
    });
  });
});
