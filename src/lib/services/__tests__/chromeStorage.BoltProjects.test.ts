import { ChromeStorageService } from '../chromeStorage';
import type { BoltProject } from '$lib/types';

// Mock chrome.storage API
const mockStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  },
  sync: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  },
};

global.chrome = {
  storage: mockStorage,
  runtime: {
    lastError: null,
  },
} as any;

describe('ChromeStorageService - BoltProjects', () => {
  let service: ChromeStorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChromeStorageService();
    // Reset lastError
    chrome.runtime.lastError = null;
  });

  describe('getBoltProjects', () => {
    it('should retrieve bolt projects from chrome.storage.local', async () => {
      const mockProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          github_repo_description: 'Test repository',
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

      expect(mockStorage.local.get).toHaveBeenCalledWith(['boltProjects'], expect.any(Function));
      expect(result).toEqual(mockProjects);
    });

    it('should return empty array if no projects stored', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const result = await service.getBoltProjects();

      expect(result).toEqual([]);
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
          github_repo_name: 'test-repo',
          github_repo_owner: 'test-user',
          is_private: false,
          repoName: 'test-repo',
          branch: 'main',
          last_modified: '2024-01-01T00:00:00Z',
          version: 1,
        },
      ];

      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      await service.saveBoltProjects(mockProjects);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        { boltProjects: mockProjects },
        expect.any(Function)
      );
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
          github_repo_name: 'test-repo-1',
          is_private: false,
          repoName: 'test-repo-1',
          branch: 'main',
        },
        {
          id: 'project-2',
          bolt_project_id: 'bolt-2',
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
    });

    it('should return null if project not found', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      const result = await service.getBoltProject('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateBoltProject', () => {
    it('should update an existing bolt project', async () => {
      const existingProjects: BoltProject[] = [
        {
          id: 'project-1',
          bolt_project_id: 'bolt-1',
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

      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      await service.updateBoltProject('project-1', updatedProject);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        {
          boltProjects: [
            {
              ...existingProjects[0],
              ...updatedProject,
            },
          ],
        },
        expect.any(Function)
      );
    });

    it('should throw error if project not found', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      await expect(service.updateBoltProject('non-existent', { version: 2 })).rejects.toThrow(
        'Project with id non-existent not found'
      );
    });
  });

  describe('deleteBoltProject', () => {
    it('should delete a bolt project by id', async () => {
      const existingProjects: BoltProject[] = [
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
          is_private: true,
          repoName: 'test-repo-2',
          branch: 'develop',
        },
      ];

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: existingProjects });
      });

      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      await service.deleteBoltProject('project-1');

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        {
          boltProjects: [existingProjects[1]],
        },
        expect.any(Function)
      );
    });

    it('should not throw error if project not found', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ boltProjects: [] });
      });

      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      // Should not throw
      await service.deleteBoltProject('non-existent');

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        { boltProjects: [] },
        expect.any(Function)
      );
    });
  });

  describe('getLastSyncTimestamp', () => {
    it('should retrieve last sync timestamp', async () => {
      const timestamp = '2024-01-01T00:00:00Z';

      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ lastSyncTimestamp: timestamp });
      });

      const result = await service.getLastSyncTimestamp();

      expect(mockStorage.local.get).toHaveBeenCalledWith(
        ['lastSyncTimestamp'],
        expect.any(Function)
      );
      expect(result).toBe(timestamp);
    });

    it('should return null if no timestamp stored', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const result = await service.getLastSyncTimestamp();

      expect(result).toBeNull();
    });
  });

  describe('setLastSyncTimestamp', () => {
    it('should save last sync timestamp', async () => {
      const timestamp = '2024-01-01T00:00:00Z';

      mockStorage.local.set.mockImplementation((data, callback) => {
        callback?.();
      });

      await service.setLastSyncTimestamp(timestamp);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        { lastSyncTimestamp: timestamp },
        expect.any(Function)
      );
    });
  });
});
