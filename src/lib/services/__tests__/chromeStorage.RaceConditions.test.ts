import type { GitHubSettingsInterface } from '../../types';
import { ChromeStorageService } from '../chromeStorage';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();

const mockOnChanged = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
  onChanged: mockOnChanged,
};

(global as unknown as { chrome: { storage: typeof mockChromeStorage } }).chrome = {
  storage: mockChromeStorage,
};

describe('ChromeStorageService Race Condition Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
    vi.clearAllMocks();

    mockChromeStorage.sync.get.mockResolvedValue({ projectSettings: {} });
    mockChromeStorage.sync.set.mockResolvedValue(undefined);
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Concurrent saveProjectSettings calls', () => {
    it('should handle multiple concurrent writes correctly', async () => {
      const projectId = 'test-project';
      const savedData: Record<string, unknown>[] = [];

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(JSON.parse(JSON.stringify(data)));
      });

      const promises = [
        ChromeStorageService.saveProjectSettings(projectId, 'repo1', 'main', 'title1'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo2', 'main', 'title2'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo3', 'main', 'title3'),
      ];

      await Promise.all(promises);

      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);

      const lastSavedData = savedData[savedData.length - 1] as {
        projectSettings: Record<string, { repoName: string; branch: string; projectTitle: string }>;
      };
      expect(lastSavedData.projectSettings[projectId]).toEqual({
        repoName: 'repo3',
        branch: 'main',
        projectTitle: 'title3',
      });
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

      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);
    });

    it('should preserve projectTitle in concurrent operations', async () => {
      const projectId = 'test-project';
      const savedData: Record<string, unknown>[] = [];

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(JSON.parse(JSON.stringify(data.projectSettings[projectId])));
      });

      await Promise.all([
        ChromeStorageService.saveProjectSettings(projectId, 'repo1', 'main', 'Title 1'),
        ChromeStorageService.saveProjectSettings(projectId, 'repo2', 'dev', 'Title 2'),
      ]);

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

      await ChromeStorageService.saveProjectSettings(projectId, 'test-repo', 'main', 'Test Title');

      expect(timestampData).toHaveLength(1);
      expect(timestampData[0]).toMatchObject({
        projectId: 'test-project',
        repoName: 'test-repo',
        branch: 'main',
        projectTitle: 'Test Title',
        timestamp: FIXED_TIME,
      });
    });
  });

  describe('Concurrent saveGitHubSettings calls', () => {
    it('should handle concurrent GitHub settings updates', async () => {
      const savedData: GitHubSettingsInterface[] = [];

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(data as GitHubSettingsInterface);
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

      expect(savedData).toHaveLength(2);
      expect(savedData[0].repoOwner).toBe('owner1');
      expect(savedData[1].repoOwner).toBe('owner2');
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
      const mockCallback = vi.fn();

      ChromeStorageService.setupStorageListener(mockCallback);

      expect(mockOnChanged.addListener).toHaveBeenCalledWith(expect.any(Function));

      const addListenerCall = mockOnChanged.addListener.mock.calls[0] as [
        (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => void,
      ];
      const listener = addListenerCall[0];

      listener({ projectSettings: { newValue: {}, oldValue: {} } }, 'sync');
      expect(mockCallback).toHaveBeenCalledWith({
        projectSettings: { newValue: {}, oldValue: {} },
      });

      mockCallback.mockClear();
      listener({ githubToken: { newValue: 'token' } }, 'sync');
      expect(mockCallback).not.toHaveBeenCalled();

      listener({ projectSettings: { newValue: {} } }, 'local');
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Write queue behavior', () => {
    it('should handle multiple operations completing successfully', async () => {
      const savedData: string[] = [];

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(data.repoOwner || data.projectSettings?.testProject?.repoName || 'unknown');
      });

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

      expect(savedData).toHaveLength(3);
      expect(savedData).toContain('first');
      expect(savedData).toContain('second');
      expect(savedData).toContain('third');
    });

    it('should provide queue statistics for monitoring', async () => {
      const initialStats = ChromeStorageService.getQueueStats();
      expect(initialStats.pendingOperations).toBe(0);
      expect(typeof initialStats.totalOperations).toBe('number');

      const promises = [
        ChromeStorageService.saveProjectSettings('project1', 'repo1', 'main'),
        ChromeStorageService.saveProjectSettings('project2', 'repo2', 'main'),
      ];

      const statsWithPending = ChromeStorageService.getQueueStats();
      expect(statsWithPending.totalOperations).toBeGreaterThan(initialStats.totalOperations);

      await Promise.all(promises);

      const finalStats = ChromeStorageService.getQueueStats();
      expect(finalStats.pendingOperations).toBe(0);
    });

    it('should continue queue processing after an error', async () => {
      const savedData: string[] = [];
      let callCount = 0;

      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated error');
        }
        savedData.push(data.repoOwner || 'project');
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
        }).catch(() => {}),
        ChromeStorageService.saveGitHubSettings({
          githubToken: 'token3',
          repoOwner: 'third',
          projectSettings: {},
          authenticationMethod: 'pat',
        }),
      ];

      await Promise.all(promises);

      expect(savedData).toEqual(['first', 'third']);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('Real-world race condition scenarios', () => {
    it('should handle user saving settings while sync is running', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'old-repo', branch: 'main' },
        },
      });

      const savedData: { projectSettings: Record<string, unknown> }[] = [];
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(JSON.parse(JSON.stringify(data)));
      });

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

      expect(savedData).toHaveLength(2);

      expect(savedData[0].projectSettings.project1).toEqual({
        repoName: 'user-repo',
        branch: 'main',
        projectTitle: 'User Title',
      });

      expect(savedData[1].projectSettings.project1).toEqual({
        repoName: 'sync-repo',
        branch: 'dev',
      });
    });

    it('should handle multiple tabs saving different projects simultaneously', async () => {
      let persistentProjectSettings: Record<string, unknown> = {};

      mockChromeStorage.sync.get.mockImplementation(async () => ({
        projectSettings: { ...persistentProjectSettings },
      }));

      const savedData: Record<string, unknown>[] = [];
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        persistentProjectSettings = { ...persistentProjectSettings, ...data.projectSettings };
        savedData.push(JSON.parse(JSON.stringify(data.projectSettings)));
      });

      await Promise.all([
        ChromeStorageService.saveProjectSettings('tab1-project', 'repo1', 'main', 'Tab 1'),
        ChromeStorageService.saveProjectSettings('tab2-project', 'repo2', 'dev', 'Tab 2'),
        ChromeStorageService.saveProjectSettings('tab3-project', 'repo3', 'feature', 'Tab 3'),
      ]);

      expect(savedData).toHaveLength(3);

      expect(savedData[0]).toEqual({
        'tab1-project': { repoName: 'repo1', branch: 'main', projectTitle: 'Tab 1' },
      });

      expect(savedData[1]).toEqual({
        'tab1-project': { repoName: 'repo1', branch: 'main', projectTitle: 'Tab 1' },
        'tab2-project': { repoName: 'repo2', branch: 'dev', projectTitle: 'Tab 2' },
      });

      expect(savedData[2]).toEqual({
        'tab1-project': { repoName: 'repo1', branch: 'main', projectTitle: 'Tab 1' },
        'tab2-project': { repoName: 'repo2', branch: 'dev', projectTitle: 'Tab 2' },
        'tab3-project': { repoName: 'repo3', branch: 'feature', projectTitle: 'Tab 3' },
      });
    });
  });

  describe('deleteProjectSettings thread safety', () => {
    it('should handle concurrent project deletion operations', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
          project2: { repoName: 'repo2', branch: 'main' },
          project3: { repoName: 'repo3', branch: 'main' },
        },
      });

      const savedData: { projectSettings: Record<string, unknown> }[] = [];
      mockChromeStorage.sync.set.mockImplementation(async (data) => {
        savedData.push(JSON.parse(JSON.stringify(data)));
      });

      await Promise.all([
        ChromeStorageService.deleteProjectSettings('project1'),
        ChromeStorageService.deleteProjectSettings('project2'),
        ChromeStorageService.deleteProjectSettings('project3'),
      ]);

      expect(savedData).toHaveLength(3);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledTimes(3);

      const finalData = savedData[savedData.length - 1];
      expect(Object.keys(finalData.projectSettings)).toHaveLength(0);
    });

    it('should save deletion timestamp for race condition detection', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
        },
      });

      const timestampData: { projectId: string; action: string; timestamp: number }[] = [];
      mockChromeStorage.local.set.mockImplementation(async (data) => {
        if (data.lastSettingsUpdate) {
          timestampData.push(
            data.lastSettingsUpdate as { projectId: string; action: string; timestamp: number }
          );
        }
      });

      await ChromeStorageService.deleteProjectSettings('project1');

      expect(timestampData).toHaveLength(1);
      expect(timestampData[0]).toMatchObject({
        projectId: 'project1',
        action: 'delete',
        timestamp: FIXED_TIME,
      });
    });

    it('should handle deletion of non-existent project gracefully', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          project1: { repoName: 'repo1', branch: 'main' },
        },
      });

      await ChromeStorageService.deleteProjectSettings('non-existent-project');

      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled();
      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });
  });
});
