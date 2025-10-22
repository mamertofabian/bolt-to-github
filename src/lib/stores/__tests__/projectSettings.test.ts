import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentProjectId,
  currentProjectTitle,
  isOnBoltProject,
  projectSettingsActions,
  projectSettingsStore,
  type ProjectSettingsState,
} from '../projectSettings';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();

const mockChromeStorage = {
  sync: {
    get: vi.fn(),
  },
};

const mockChromeTabs = {
  query: vi.fn(),
};

const mockChromeRuntime = {
  getManifest: vi.fn(),
};

global.chrome = {
  storage: mockChromeStorage,
  tabs: mockChromeTabs,
  runtime: mockChromeRuntime,
} as unknown as typeof chrome;

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../services/chromeStorage', () => ({
  ChromeStorageService: {
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('projectSettings Store', () => {
  const defaultState: ProjectSettingsState = {
    currentUrl: '',
    isBoltSite: false,
    parsedProjectId: null,
    version: '',
    projectTitle: 'My Project',
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
    vi.clearAllMocks();

    projectSettingsStore.set(defaultState);

    mockChromeStorage.sync.get.mockResolvedValue({});
    mockChromeTabs.query.mockResolvedValue([]);
    mockChromeRuntime.getManifest.mockReturnValue({ version: '1.0.0' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('store initialization', () => {
    it('should initialize with default state', () => {
      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('');
      expect(state.isBoltSite).toBe(false);
      expect(state.parsedProjectId).toBe(null);
      expect(state.version).toBe('');
      expect(state.projectTitle).toBe('My Project');
    });
  });

  describe('derived stores', () => {
    it('should derive isOnBoltProject as true when on bolt site with project ID', () => {
      projectSettingsStore.set({
        ...defaultState,
        isBoltSite: true,
        parsedProjectId: 'test-project-123',
      });

      expect(get(isOnBoltProject)).toBe(true);
    });

    it('should derive isOnBoltProject as false when on bolt site without project ID', () => {
      projectSettingsStore.set({
        ...defaultState,
        isBoltSite: true,
        parsedProjectId: null,
      });

      expect(get(isOnBoltProject)).toBe(false);
    });

    it('should derive isOnBoltProject as false when not on bolt site', () => {
      projectSettingsStore.set({
        ...defaultState,
        isBoltSite: false,
        parsedProjectId: 'test-project-123',
      });

      expect(get(isOnBoltProject)).toBe(false);
    });

    it('should derive currentProjectId correctly', () => {
      projectSettingsStore.set({
        ...defaultState,
        parsedProjectId: 'my-project-456',
      });

      expect(get(currentProjectId)).toBe('my-project-456');
    });

    it('should derive currentProjectId as null when no project', () => {
      projectSettingsStore.set({
        ...defaultState,
        parsedProjectId: null,
      });

      expect(get(currentProjectId)).toBe(null);
    });

    it('should derive currentProjectTitle correctly', () => {
      projectSettingsStore.set({
        ...defaultState,
        projectTitle: 'Test Project Title',
      });

      expect(get(currentProjectTitle)).toBe('Test Project Title');
    });
  });

  describe('projectSettingsActions.initialize', () => {
    it('should set version from chrome manifest', () => {
      mockChromeRuntime.getManifest.mockReturnValue({ version: '2.5.0' });

      projectSettingsActions.initialize();

      const state = get(projectSettingsStore);
      expect(state.version).toBe('2.5.0');
    });

    it('should preserve other state when setting version', () => {
      projectSettingsStore.set({
        currentUrl: 'https://bolt.new/~/test-123',
        isBoltSite: true,
        parsedProjectId: 'test-123',
        version: '',
        projectTitle: 'Test Project',
      });

      mockChromeRuntime.getManifest.mockReturnValue({ version: '3.0.0' });

      projectSettingsActions.initialize();

      const state = get(projectSettingsStore);
      expect(state.version).toBe('3.0.0');
      expect(state.currentUrl).toBe('https://bolt.new/~/test-123');
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe('test-123');
      expect(state.projectTitle).toBe('Test Project');
    });
  });

  describe('projectSettingsActions.setCurrentUrl', () => {
    it('should detect bolt.new URL and extract project ID', async () => {
      const url = 'https://bolt.new/~/abc-def-123';

      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe(url);
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe('abc-def-123');
    });

    it('should detect bolt.new URL without project ID', () => {
      const url = 'https://bolt.new/';

      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe(url);
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe(null);
    });

    it('should handle non-bolt.new URL', () => {
      const url = 'https://github.com/user/repo';

      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe(url);
      expect(state.isBoltSite).toBe(false);
      expect(state.parsedProjectId).toBe(null);
    });

    it('should load project title when project ID is detected', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'test-project-789': {
            projectTitle: 'Loaded Project Title',
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      const url = 'https://bolt.new/~/test-project-789';

      projectSettingsActions.setCurrentUrl(url);

      await vi.waitFor(() => {
        const state = get(projectSettingsStore);
        expect(state.projectTitle).toBe('Loaded Project Title');
      });
    });

    it('should handle URL with query parameters', () => {
      const url = 'https://bolt.new/~/project-123?param=value';

      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe(url);
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe('project-123');
    });

    it('should handle URL with hash', () => {
      const url = 'https://bolt.new/~/project-456#section';

      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe(url);
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe('project-456');
    });
  });

  describe('projectSettingsActions.setProjectId', () => {
    it('should set project ID directly', () => {
      projectSettingsActions.setProjectId('direct-project-id');

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe('direct-project-id');
    });

    it('should set project ID to null', () => {
      projectSettingsStore.set({
        ...defaultState,
        parsedProjectId: 'existing-id',
      });

      projectSettingsActions.setProjectId(null);

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe(null);
    });

    it('should preserve other state when setting project ID', () => {
      projectSettingsStore.set({
        currentUrl: 'https://bolt.new/~/old-id',
        isBoltSite: true,
        parsedProjectId: 'old-id',
        version: '1.0.0',
        projectTitle: 'Old Title',
      });

      projectSettingsActions.setProjectId('new-id');

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe('new-id');
      expect(state.currentUrl).toBe('https://bolt.new/~/old-id');
      expect(state.isBoltSite).toBe(true);
      expect(state.version).toBe('1.0.0');
      expect(state.projectTitle).toBe('Old Title');
    });
  });

  describe('projectSettingsActions.setProjectTitle', () => {
    it('should set project title', () => {
      projectSettingsActions.setProjectTitle('New Project Title');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('New Project Title');
    });

    it('should set empty project title', () => {
      projectSettingsStore.set({
        ...defaultState,
        projectTitle: 'Existing Title',
      });

      projectSettingsActions.setProjectTitle('');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should preserve other state when setting project title', () => {
      projectSettingsStore.set({
        currentUrl: 'https://bolt.new/~/test-123',
        isBoltSite: true,
        parsedProjectId: 'test-123',
        version: '1.0.0',
        projectTitle: 'Old Title',
      });

      projectSettingsActions.setProjectTitle('Updated Title');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('Updated Title');
      expect(state.currentUrl).toBe('https://bolt.new/~/test-123');
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe('test-123');
      expect(state.version).toBe('1.0.0');
    });
  });

  describe('projectSettingsActions.loadProjectTitle', () => {
    it('should load project title from storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'project-123': {
            projectTitle: 'Stored Title',
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      await projectSettingsActions.loadProjectTitle('project-123');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('Stored Title');
    });

    it('should set empty title when project not found in storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await projectSettingsActions.loadProjectTitle('nonexistent-project');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should set empty title when project has no title', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'project-456': {
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      await projectSettingsActions.loadProjectTitle('project-456');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should set empty title when projectSettings is undefined', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});

      await projectSettingsActions.loadProjectTitle('project-789');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should handle storage error gracefully', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      await projectSettingsActions.loadProjectTitle('project-error');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should request correct storage key', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {},
      });

      await projectSettingsActions.loadProjectTitle('test-id');

      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(['projectSettings']);
    });
  });

  describe('projectSettingsActions.parseProjectIdFromUrl', () => {
    it('should parse project ID from valid bolt.new URL', () => {
      const url = 'https://bolt.new/~/my-project-id';
      const result = projectSettingsActions.parseProjectIdFromUrl(url);
      expect(result).toBe('my-project-id');
    });

    it('should return null for bolt.new URL without project ID', () => {
      const url = 'https://bolt.new/';
      const result = projectSettingsActions.parseProjectIdFromUrl(url);
      expect(result).toBe(null);
    });

    it('should return null for non-bolt.new URL', () => {
      const url = 'https://github.com/user/repo';
      const result = projectSettingsActions.parseProjectIdFromUrl(url);
      expect(result).toBe(null);
    });

    it('should handle URL with query parameters', () => {
      const url = 'https://bolt.new/~/project-with-params?query=test';
      const result = projectSettingsActions.parseProjectIdFromUrl(url);
      expect(result).toBe('project-with-params');
    });

    it('should handle URL with hash', () => {
      const url = 'https://bolt.new/~/project-with-hash#anchor';
      const result = projectSettingsActions.parseProjectIdFromUrl(url);
      expect(result).toBe('project-with-hash');
    });

    it('should handle project ID with special characters', () => {
      const url = 'https://bolt.new/~/project-123_abc-XYZ';
      const result = projectSettingsActions.parseProjectIdFromUrl(url);
      expect(result).toBe('project-123_abc-XYZ');
    });
  });

  describe('projectSettingsActions.isBoltUrl', () => {
    it('should return true for bolt.new URL', () => {
      expect(projectSettingsActions.isBoltUrl('https://bolt.new/')).toBe(true);
    });

    it('should return true for bolt.new URL with project', () => {
      expect(projectSettingsActions.isBoltUrl('https://bolt.new/~/project-123')).toBe(true);
    });

    it('should return false for non-bolt.new URL', () => {
      expect(projectSettingsActions.isBoltUrl('https://github.com/')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(projectSettingsActions.isBoltUrl('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(projectSettingsActions.isBoltUrl('https://BOLT.NEW/')).toBe(false);
    });
  });

  describe('projectSettingsActions.detectCurrentProject', () => {
    it('should detect project from active tab', async () => {
      mockChromeTabs.query.mockResolvedValue([
        {
          url: 'https://bolt.new/~/detected-project',
          active: true,
        },
      ]);

      await projectSettingsActions.detectCurrentProject();

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('https://bolt.new/~/detected-project');
      expect(state.parsedProjectId).toBe('detected-project');
    });

    it('should update storage with detected project ID', async () => {
      const { ChromeStorageService } = await import('../../services/chromeStorage');

      mockChromeTabs.query.mockResolvedValue([
        {
          url: 'https://bolt.new/~/storage-test-project',
          active: true,
        },
      ]);

      await projectSettingsActions.detectCurrentProject();

      expect(ChromeStorageService.set).toHaveBeenCalledWith({
        projectId: 'storage-test-project',
      });
    });

    it('should clear project ID when not on project page', async () => {
      projectSettingsStore.set({
        ...defaultState,
        parsedProjectId: 'existing-project',
      });

      mockChromeTabs.query.mockResolvedValue([
        {
          url: 'https://bolt.new/',
          active: true,
        },
      ]);

      await projectSettingsActions.detectCurrentProject();

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe(null);
    });

    it('should handle tab without URL', async () => {
      mockChromeTabs.query.mockResolvedValue([
        {
          active: true,
        },
      ]);

      await projectSettingsActions.detectCurrentProject();

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('');
    });

    it('should handle no active tabs', async () => {
      mockChromeTabs.query.mockResolvedValue([]);

      await projectSettingsActions.detectCurrentProject();

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('');
    });

    it('should handle chrome.tabs.query error', async () => {
      mockChromeTabs.query.mockRejectedValue(new Error('Tab query error'));

      await expect(projectSettingsActions.detectCurrentProject()).resolves.not.toThrow();
    });

    it('should query for active tab in current window', async () => {
      mockChromeTabs.query.mockResolvedValue([]);

      await projectSettingsActions.detectCurrentProject();

      expect(mockChromeTabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });
  });

  describe('projectSettingsActions.getCurrentState', () => {
    it('should return current state as promise', async () => {
      const testState: ProjectSettingsState = {
        currentUrl: 'https://bolt.new/~/test-state',
        isBoltSite: true,
        parsedProjectId: 'test-state',
        version: '2.0.0',
        projectTitle: 'Test State Title',
      };

      projectSettingsStore.set(testState);

      const statePromise = projectSettingsActions.getCurrentState();
      expect(statePromise).toBeInstanceOf(Promise);

      const state = await statePromise;
      expect(state).toEqual(testState);
    });

    it('should resolve to latest state', async () => {
      const initialState: ProjectSettingsState = {
        currentUrl: 'https://example.com',
        isBoltSite: false,
        parsedProjectId: null,
        version: '1.5.0',
        projectTitle: 'Example',
      };

      projectSettingsStore.set(initialState);

      const updatedState: ProjectSettingsState = {
        ...initialState,
        currentUrl: 'https://bolt.new/~/updated',
        parsedProjectId: 'updated',
        isBoltSite: true,
      };

      projectSettingsStore.set(updatedState);

      const state = await projectSettingsActions.getCurrentState();
      expect(state).toEqual(updatedState);
    });
  });

  describe('projectSettingsActions.reset', () => {
    it('should reset project state to empty values', () => {
      projectSettingsStore.set({
        currentUrl: 'https://bolt.new/~/project-123',
        isBoltSite: true,
        parsedProjectId: 'project-123',
        version: '2.0.0',
        projectTitle: 'Test Project',
      });

      projectSettingsActions.reset();

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('');
      expect(state.isBoltSite).toBe(false);
      expect(state.parsedProjectId).toBe(null);
      expect(state.projectTitle).toBe('');
    });

    it('should preserve version when resetting', () => {
      projectSettingsStore.set({
        currentUrl: 'https://bolt.new/~/project-456',
        isBoltSite: true,
        parsedProjectId: 'project-456',
        version: '3.5.0',
        projectTitle: 'Another Project',
      });

      projectSettingsActions.reset();

      const state = get(projectSettingsStore);
      expect(state.version).toBe('3.5.0');
    });

    it('should allow resetting multiple times', () => {
      projectSettingsActions.reset();
      projectSettingsActions.reset();

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('');
      expect(state.parsedProjectId).toBe(null);
    });
  });

  describe('integration scenarios', () => {
    it('should handle full project navigation flow', async () => {
      mockChromeRuntime.getManifest.mockReturnValue({ version: '1.0.0' });
      projectSettingsActions.initialize();

      mockChromeTabs.query.mockResolvedValue([
        {
          url: 'https://bolt.new/~/my-project',
          active: true,
        },
      ]);

      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'my-project': {
            projectTitle: 'My Awesome Project',
            repoName: 'awesome-repo',
            branch: 'main',
          },
        },
      });

      await projectSettingsActions.detectCurrentProject();

      await vi.waitFor(() => {
        const state = get(projectSettingsStore);
        expect(state.version).toBe('1.0.0');
        expect(state.currentUrl).toBe('https://bolt.new/~/my-project');
        expect(state.isBoltSite).toBe(true);
        expect(state.parsedProjectId).toBe('my-project');
        expect(state.projectTitle).toBe('My Awesome Project');
      });
    });

    it('should handle project switch flow', () => {
      projectSettingsActions.setCurrentUrl('https://bolt.new/~/project-1');
      let state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe('project-1');

      projectSettingsActions.setCurrentUrl('https://bolt.new/~/project-2');
      state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe('project-2');
    });

    it('should handle navigation away from bolt.new', () => {
      projectSettingsActions.setCurrentUrl('https://bolt.new/~/my-project');
      let state = get(projectSettingsStore);
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe('my-project');

      projectSettingsActions.setCurrentUrl('https://github.com/');
      state = get(projectSettingsStore);
      expect(state.isBoltSite).toBe(false);
      expect(state.parsedProjectId).toBe(null);
    });

    it('should update project title after loading', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'dynamic-project': {
            projectTitle: 'Initial Title',
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      projectSettingsActions.setCurrentUrl('https://bolt.new/~/dynamic-project');

      await vi.waitFor(() => {
        const state = get(projectSettingsStore);
        expect(state.projectTitle).toBe('Initial Title');
      });

      projectSettingsActions.setProjectTitle('Updated Title');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('Updated Title');
    });

    it('should handle rapid URL changes', () => {
      const urls = [
        'https://bolt.new/~/project-1',
        'https://bolt.new/~/project-2',
        'https://bolt.new/~/project-3',
        'https://github.com/',
        'https://bolt.new/~/project-4',
      ];

      for (const url of urls) {
        projectSettingsActions.setCurrentUrl(url);
      }

      const state = get(projectSettingsStore);
      expect(state.currentUrl).toBe('https://bolt.new/~/project-4');
      expect(state.parsedProjectId).toBe('project-4');
      expect(state.isBoltSite).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed bolt.new URL', () => {
      const url = 'https://bolt.new/invalid/path';
      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.isBoltSite).toBe(true);
      expect(state.parsedProjectId).toBe(null);
    });

    it('should handle URL with multiple tildes', () => {
      const url = 'https://bolt.new/~/~/double-tilde';
      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe('~');
    });

    it('should handle very long project ID', () => {
      const longId = 'a'.repeat(1000);
      const url = `https://bolt.new/~/${longId}`;
      projectSettingsActions.setCurrentUrl(url);

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe(longId);
    });

    it('should handle empty project title from storage', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'empty-title': {
            projectTitle: '',
            repoName: 'test-repo',
            branch: 'main',
          },
        },
      });

      await projectSettingsActions.loadProjectTitle('empty-title');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should handle null values in storage gracefully', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        projectSettings: {
          'null-project': null,
        },
      });

      await projectSettingsActions.loadProjectTitle('null-project');

      const state = get(projectSettingsStore);
      expect(state.projectTitle).toBe('');
    });

    it('should handle concurrent state updates', async () => {
      const updates = [
        () => projectSettingsActions.setProjectId('project-1'),
        () => projectSettingsActions.setProjectTitle('Title 1'),
        () => projectSettingsActions.setCurrentUrl('https://bolt.new/~/project-2'),
        () => projectSettingsActions.setProjectTitle('Title 2'),
      ];

      for (const update of updates) {
        update();
      }

      const state = get(projectSettingsStore);
      expect(state.parsedProjectId).toBe('project-2');
      expect(state.projectTitle).toBe('Title 2');
    });
  });
});
