import { ChromeStorageService } from '../chromeStorage';
import type { GitHubSettingsInterface } from '../../types';

// Mock chrome.storage
const mockOnChanged = {
  addListener: jest.fn(),
  removeListener: jest.fn(),
};

const mockChromeStorage = {
  sync: {
    get: jest.fn(),
    set: jest.fn(),
  },
  local: {
    get: jest.fn(),
    set: jest.fn(),
  },
  onChanged: mockOnChanged,
};

(global as unknown as { chrome: { storage: typeof mockChromeStorage } }).chrome = {
  storage: mockChromeStorage,
};

describe('ChromeStorageService Race Condition Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockChromeStorage.sync.get.mockResolvedValue({ projectSettings: {} });
    mockChromeStorage.sync.set.mockResolvedValue(undefined);
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
  });

  describe('Concurrent saveProjectSettings calls', () => {
    it('should serialize multiple concurrent writes', async () => {
      const projectId = 'test-project';
      const setCallOrder: string[] = [];

      // Track the order of set calls
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        setCallOrder.push(data.projectSettings[projectId]?.repoName || 'unknown');
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Start multiple concurrent saves
      const promises = [
        ChromeStorageService.saveProjectSettings(projectId, 'repo1', 'main', 'title1'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo2', 'main', 'title2'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo3', 'main', 'title3'),
      ];

      await Promise.all(promises);

      // Verify all calls were made
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);

      // Verify they were serialized (calls happened in order)
      expect(setCallOrder).toEqual(['repo1', 'repo2', 'repo3']);
    });

    it('should handle errors in one operation without affecting others', async () => {
      const projectId = 'test-project';
      let callCount = 0;

      mockChromeStorage.sync.set.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated storage error');
        }
      });

      const promises = [
        ChromeStorageService.saveProjectSettings(projectId, 'repo1', 'main'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo2', 'main'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo3', 'main'),
      ];

      const results = await Promise.allSettled(promises);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      // Verify all operations were attempted
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);
    });

    it('should preserve projectTitle in concurrent operations', async () => {
      const projectId = 'test-project';
      const savedData: Record<string, unknown>[] = [];

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(data.projectSettings[projectId]);
      });

      await Promise.all([
        ChromeStorageService.saveProjectSettings(projectId, 'repo1', 'main', 'Title 1'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo2', 'dev', 'Title 2'),
      ]);

      // Last operation should have overwritten the first
      expect(savedData).toHaveLength(2);
      expect(savedData[0]).toEqual({
        repoName: 'repo1',
        branch: 'main',
        projectTitle: 'Title 1',
      });
      expect(savedData[1]).toEqual({
        repoName: 'repo2',
        branch: 'dev',
        projectTitle: 'Title 2',
      });
    });

    it('should save timestamp for race condition detection', async () => {
      const projectId = 'test-project';
      const timestampData: Record<string, unknown>[] = [];

      mockChromeStorage.local.set.mockImplementation(async (data) => {
        if (data.lastSettingsUpdate) {
          timestampData.push(data.lastSettingsUpdate);
        }
      });

      const beforeTime = Date.now();
      await ChromeStorageService.saveProjectSettings(projectId, 'test-repo', 'main', 'Test Title');
      const afterTime = Date.now();

      expect(timestampData).toHaveLength(1);
      expect(timestampData[0]).toMatchObject({
        projectId: 'test-project',
        repoName: 'test-repo',
        branch: 'main',
        projectTitle: 'Test Title',
      });

      // Verify timestamp is within expected range
      expect(timestampData[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampData[0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Concurrent saveGitHubSettings calls', () => {
    it('should serialize GitHub settings updates', async () => {
      const setCallOrder: string[] = [];

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        setCallOrder.push(data.repoOwner);
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      const settings1: GitHubSettingsInterface = {
        githubToken: 'token1',
        repoOwner: 'owner1',
        projectSettings: {},
        authenticationMethod: 'pat',
      };

      const settings2: GitHubSettingsInterface = {
        githubToken: 'token2',
        repoOwner: 'owner2',
        projectSettings: {},
        authenticationMethod: 'pat',
      };

      await Promise.all([
        ChromeStorageService.saveGitHubSettings(settings1),
        ChromeStorageService.saveGitHubSettings(settings2),
      ]);

      expect(setCallOrder).toEqual(['owner1', 'owner2']);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed sync and local storage operations', async () => {
      const settingsWithApp: GitHubSettingsInterface = {
        githubToken: '',
        repoOwner: 'owner1',
        projectSettings: {},
        authenticationMethod: 'github_app',
        githubAppInstallationId: 123,
        githubAppUsername: 'testuser',
      };

      await ChromeStorageService.saveGitHubSettings(settingsWithApp);

      // Should save to both sync and local storage
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        githubToken: '',
        repoOwner: 'owner1',
        projectSettings: {},
      });

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        authenticationMethod: 'github_app',
        githubAppInstallationId: 123,
        githubAppUsername: 'testuser',
      });
    });
  });

  describe('Storage change listener', () => {
    it('should set up storage change listener correctly', () => {
      const mockCallback = jest.fn();

      ChromeStorageService.setupStorageListener(mockCallback);

      expect(mockOnChanged.addListener).toHaveBeenCalledWith(expect.any(Function));

      // Simulate a change event
      const addListenerCall = mockOnChanged.addListener.mock.calls[0];
      const listener = addListenerCall[0];

      // Test that callback is called for projectSettings changes
      listener({ projectSettings: { newValue: {}, oldValue: {} } }, 'sync');
      expect(mockCallback).toHaveBeenCalledWith({
        projectSettings: { newValue: {}, oldValue: {} },
      });

      // Test that callback is NOT called for other changes
      mockCallback.mockClear();
      listener({ githubToken: { newValue: 'token' } }, 'sync');
      expect(mockCallback).not.toHaveBeenCalled();

      // Test that callback is NOT called for local storage changes
      listener({ projectSettings: { newValue: {} } }, 'local');
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Write queue behavior', () => {
    it('should queue operations and execute them in order', async () => {
      const executionOrder: string[] = [];
      let operationDelay = 50;

      // Mock storage operations with decreasing delays to test queue ordering
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        const delay = operationDelay;
        operationDelay -= 10; // Each subsequent operation would be faster without queue

        await new Promise((resolve) => setTimeout(resolve, delay));
        executionOrder.push(
          data.repoOwner || data.projectSettings?.testProject?.repoName || 'unknown'
        );
      });

      // Start operations that would complete in reverse order without queuing
      const promises = [
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token1',
          repoOwner: 'first',
          projectSettings: {},
          authenticationMethod: 'pat',
        }),
        ChromeStorageService.saveProjectSettings('testProject', 'second', 'main'),
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token2',
          repoOwner: 'third',
          projectSettings: {},
          authenticationMethod: 'pat',
        }),
      ];

      await Promise.all(promises);

      // Despite different delays, operations should execute in queue order
      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('should provide queue statistics for monitoring', async () => {
      // Get initial stats
      const initialStats = ChromeStorageService.getQueueStats();
      expect(initialStats.pendingOperations).toBe(0);
      expect(typeof initialStats.totalOperations).toBe('number');

      // Start some operations but don't await them yet
      const promises = [
        ChromeStorageService.saveProjectSettings('project1', 'repo1', 'main'),
        ChromeStorageService.saveProjectSettings('project2', 'repo2', 'main'),
      ];

      // Stats should show pending operations
      const statsWithPending = ChromeStorageService.getQueueStats();
      expect(statsWithPending.totalOperations).toBeGreaterThan(initialStats.totalOperations);

      // Wait for completion
      await Promise.all(promises);

      // Pending operations should be back to 0
      const finalStats = ChromeStorageService.getQueueStats();
      expect(finalStats.pendingOperations).toBe(0);
    });

    it('should continue queue processing after an error', async () => {
      const executionOrder: string[] = [];
      let callCount = 0;

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated error');
        }
        executionOrder.push(data.repoOwner || 'project');
      });

      const promises = [
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token1',
          repoOwner: 'first',
          projectSettings: {},
          authenticationMethod: 'pat',
        }),
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token2',
          repoOwner: 'second',
          projectSettings: {},
          authenticationMethod: 'pat',
        }).catch(() => {}), // Ignore error
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token3',
          repoOwner: 'third',
          projectSettings: {},
          authenticationMethod: 'pat',
        }),
      ];

      await Promise.all(promises);

      // First and third should succeed, second should fail but not break queue
      expect(executionOrder).toEqual(['first', 'third']);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('Real-world race condition scenarios', () => {
    it('should handle user saving settings while sync is running', async () => {
      // Simulate initial project settings
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'old-repo', branch: 'main' },
        },
      });

      const savedData: Record<string, unknown>[] = [];
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(JSON.parse(JSON.stringify(data)));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Simulate user saving settings and sync operation happening concurrently
      await Promise.all([
        ChromeStorageService.saveProjectSettings('project1', 'user-repo', 'main', 'User Title'),
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token',
          repoOwner: 'owner',
          projectSettings: {
            project1: { repoName: 'sync-repo', branch: 'dev' },
          },
          authenticationMethod: 'pat',
        }),
      ]);

      // Both operations should complete without overwriting each other
      expect(savedData).toHaveLength(2);

      // First operation (project settings update)
      expect(
        (savedData[0] as { projectSettings: Record<string, unknown> }).projectSettings.project1
      ).toEqual({
        repoName: 'user-repo',
        branch: 'main',
        projectTitle: 'User Title',
      });

      // Second operation (GitHub settings with project settings)
      expect(
        (savedData[1] as { projectSettings: Record<string, unknown> }).projectSettings.project1
      ).toEqual({
        repoName: 'sync-repo',
        branch: 'dev',
      });
    });

    it('should handle multiple tabs saving different projects simultaneously', async () => {
      // Mock that simulates persistent storage across operations
      let persistentProjectSettings: Record<string, unknown> = {};

      mockChromeStorage.sync.get.mockImplementation(async () => ({
        projectSettings: { ...persistentProjectSettings },
      }));

      const savedData: Record<string, unknown>[] = [];
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        // Update persistent storage to simulate real storage behavior
        persistentProjectSettings = { ...persistentProjectSettings, ...data.projectSettings };
        savedData.push(JSON.parse(JSON.stringify(data.projectSettings)));
      });

      // Simulate different tabs saving different projects
      await Promise.all([
        ChromeStorageService.saveProjectSettings('tab1-project', 'repo1', 'main', 'Tab 1'),
        ChromeStorageService.saveProjectSettings('tab2-project', 'repo2', 'dev', 'Tab 2'),
        ChromeStorageService.saveProjectSettings('tab3-project', 'repo3', 'feature', 'Tab 3'),
      ]);

      expect(savedData).toHaveLength(3);

      // First save: only tab1-project
      expect(savedData[0]).toEqual({
        'tab1-project': { repoName: 'repo1', branch: 'main', projectTitle: 'Tab 1' },
      });

      // Second save: tab1-project + tab2-project (preserves existing)
      expect(savedData[1]).toEqual({
        'tab1-project': { repoName: 'repo1', branch: 'main', projectTitle: 'Tab 1' },
        'tab2-project': { repoName: 'repo2', branch: 'dev', projectTitle: 'Tab 2' },
      });

      // Third save: all projects preserved
      expect(savedData[2]).toEqual({
        'tab1-project': { repoName: 'repo1', branch: 'main', projectTitle: 'Tab 1' },
        'tab2-project': { repoName: 'repo2', branch: 'dev', projectTitle: 'Tab 2' },
        'tab3-project': { repoName: 'repo3', branch: 'feature', projectTitle: 'Tab 3' },
      });
    });
  });

  describe('deleteProjectSettings thread safety', () => {
    it('should serialize project deletion operations', async () => {
      // Mock initial state with multiple projects
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
          project2: { repoName: 'repo2', branch: 'main' },
          project3: { repoName: 'repo3', branch: 'main' },
        },
      });

      const deletedProjects: string[] = [];
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        // Track which projects remain after each delete
        const remainingProjects = Object.keys(data.projectSettings || {});
        deletedProjects.push(`delete-op-${3 - remainingProjects.length}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Delete projects concurrently
      await Promise.all([
        ChromeStorageService.deleteProjectSettings('project1'),
        ChromeStorageService.deleteProjectSettings('project2'),
        ChromeStorageService.deleteProjectSettings('project3'),
      ]);

      // Verify operations were serialized
      expect(deletedProjects).toEqual(['delete-op-1', 'delete-op-2', 'delete-op-3']);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);
    });

    it('should save deletion timestamp for race condition detection', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
        },
      });

      const timestampData: Record<string, unknown>[] = [];
      mockChromeStorage.local.set.mockImplementation(async (data) => {
        if (data.lastSettingsUpdate) {
          timestampData.push(data.lastSettingsUpdate);
        }
      });

      const beforeTime = Date.now();
      await ChromeStorageService.deleteProjectSettings('project1');
      const afterTime = Date.now();

      expect(timestampData).toHaveLength(1);
      expect(timestampData[0]).toMatchObject({
        projectId: 'project1',
        action: 'delete',
      });
      expect(timestampData[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampData[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle deletion of non-existent project gracefully', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
        },
      });

      await ChromeStorageService.deleteProjectSettings('non-existent-project');

      // Should not attempt to save if project doesn't exist
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });
  });
});
