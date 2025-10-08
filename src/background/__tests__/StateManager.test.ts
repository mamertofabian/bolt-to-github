import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from '../StateManager';
import { SettingsService } from '../../services/settings';
import type { SettingsCheckResult } from '../../services/settings';

vi.mock('../../services/settings', () => ({
  SettingsService: {
    getGitHubSettings: vi.fn(),
    getProjectId: vi.fn(),
    setProjectId: vi.fn(),
  },
}));

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    vi.clearAllMocks();
    stateManager = StateManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = StateManager.getInstance();
      const instance2 = StateManager.getInstance();
      const instance3 = StateManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(stateManager);
    });

    it('should maintain state across getInstance calls', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'token123',
          repoOwner: 'testowner',
          projectSettings: { project1: { repoName: 'repo1', branch: 'main' } },
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const instance1 = StateManager.getInstance();
      await instance1.getGitHubSettings();

      const instance2 = StateManager.getInstance();
      await instance2.getGitHubSettings();

      expect(SettingsService.getGitHubSettings).toHaveBeenCalledTimes(2);
      expect(instance1).toBe(instance2);
    });
  });

  describe('getGitHubSettings', () => {
    it('should delegate to SettingsService.getGitHubSettings', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_test123',
          repoOwner: 'testuser',
          projectSettings: {
            project1: { repoName: 'test-repo', branch: 'main' },
          },
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const result = await stateManager.getGitHubSettings();

      expect(SettingsService.getGitHubSettings).toHaveBeenCalledTimes(1);
      expect(SettingsService.getGitHubSettings).toHaveBeenCalledWith();
      expect(result).toEqual(mockSettings);
    });

    it('should return valid settings with GitHub token', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_validtoken',
          repoOwner: 'owner123',
          projectSettings: {
            'bolt-project': { repoName: 'my-project', branch: 'develop' },
          },
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const result = await stateManager.getGitHubSettings();

      expect(result.isSettingsValid).toBe(true);
      expect(result.gitHubSettings?.githubToken).toBe('ghp_validtoken');
      expect(result.gitHubSettings?.repoOwner).toBe('owner123');
      expect(result.gitHubSettings?.projectSettings).toHaveProperty('bolt-project');
    });

    it('should return invalid settings when settings are incomplete', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: false,
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const result = await stateManager.getGitHubSettings();

      expect(result.isSettingsValid).toBe(false);
      expect(result.gitHubSettings).toBeUndefined();
    });

    it('should handle multiple project settings', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_token',
          repoOwner: 'multiproject',
          projectSettings: {
            project1: { repoName: 'repo1', branch: 'main' },
            project2: { repoName: 'repo2', branch: 'develop' },
            project3: { repoName: 'repo3', branch: 'feature/test' },
          },
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const result = await stateManager.getGitHubSettings();

      expect(result.isSettingsValid).toBe(true);
      expect(Object.keys(result.gitHubSettings?.projectSettings || {})).toHaveLength(3);
      expect(result.gitHubSettings?.projectSettings?.['project1']).toEqual({
        repoName: 'repo1',
        branch: 'main',
      });
      expect(result.gitHubSettings?.projectSettings?.['project2']).toEqual({
        repoName: 'repo2',
        branch: 'develop',
      });
    });

    it('should handle empty project settings', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_token',
          repoOwner: 'owner',
          projectSettings: {},
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const result = await stateManager.getGitHubSettings();

      expect(result.isSettingsValid).toBe(true);
      expect(result.gitHubSettings?.projectSettings).toEqual({});
    });

    it('should propagate errors from SettingsService', async () => {
      const error = new Error('Failed to retrieve settings');
      vi.mocked(SettingsService.getGitHubSettings).mockRejectedValue(error);

      await expect(stateManager.getGitHubSettings()).rejects.toThrow('Failed to retrieve settings');
      expect(SettingsService.getGitHubSettings).toHaveBeenCalledTimes(1);
    });

    it('should handle storage quota errors gracefully', async () => {
      const quotaError = new Error('QuotaExceededError');
      vi.mocked(SettingsService.getGitHubSettings).mockRejectedValue(quotaError);

      await expect(stateManager.getGitHubSettings()).rejects.toThrow('QuotaExceededError');
    });
  });

  describe('getProjectId', () => {
    it('should delegate to SettingsService.getProjectId', async () => {
      const mockProjectId = 'my-bolt-project';
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(mockProjectId);

      const result = await stateManager.getProjectId();

      expect(SettingsService.getProjectId).toHaveBeenCalledTimes(1);
      expect(SettingsService.getProjectId).toHaveBeenCalledWith();
      expect(result).toBe(mockProjectId);
    });

    it('should return project ID when it exists', async () => {
      const projectId = 'test-project-123';
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(projectId);

      const result = await stateManager.getProjectId();

      expect(result).toBe(projectId);
    });

    it('should return null when project ID does not exist', async () => {
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(null);

      const result = await stateManager.getProjectId();

      expect(result).toBeNull();
    });

    it('should handle various project ID formats', async () => {
      const testCases = [
        'simple-project',
        'project_with_underscores',
        'project-with-123-numbers',
        'UPPERCASE-PROJECT',
        'mixedCase-Project',
      ];

      for (const projectId of testCases) {
        vi.mocked(SettingsService.getProjectId).mockResolvedValue(projectId);
        const result = await stateManager.getProjectId();
        expect(result).toBe(projectId);
      }
    });

    it('should propagate errors from SettingsService', async () => {
      const error = new Error('Failed to get project ID');
      vi.mocked(SettingsService.getProjectId).mockRejectedValue(error);

      await expect(stateManager.getProjectId()).rejects.toThrow('Failed to get project ID');
      expect(SettingsService.getProjectId).toHaveBeenCalledTimes(1);
    });

    it('should handle storage access errors', async () => {
      const storageError = new Error('Storage not accessible');
      vi.mocked(SettingsService.getProjectId).mockRejectedValue(storageError);

      await expect(stateManager.getProjectId()).rejects.toThrow('Storage not accessible');
    });
  });

  describe('setProjectId', () => {
    it('should delegate to SettingsService.setProjectId', async () => {
      const projectId = 'new-project';
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      await stateManager.setProjectId(projectId);

      expect(SettingsService.setProjectId).toHaveBeenCalledTimes(1);
      expect(SettingsService.setProjectId).toHaveBeenCalledWith(projectId);
    });

    it('should set project ID successfully', async () => {
      const projectId = 'bolt-new-app';
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      await expect(stateManager.setProjectId(projectId)).resolves.toBeUndefined();
      expect(SettingsService.setProjectId).toHaveBeenCalledWith(projectId);
    });

    it('should handle setting various project ID formats', async () => {
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      const testCases = [
        'simple-project',
        'project_with_underscores',
        'project-123',
        'UPPERCASE',
        'mixedCaseProject',
        'project-with-multiple-hyphens',
      ];

      for (const projectId of testCases) {
        await stateManager.setProjectId(projectId);
        expect(SettingsService.setProjectId).toHaveBeenCalledWith(projectId);
      }

      expect(SettingsService.setProjectId).toHaveBeenCalledTimes(testCases.length);
    });

    it('should handle empty string project ID', async () => {
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      await stateManager.setProjectId('');

      expect(SettingsService.setProjectId).toHaveBeenCalledWith('');
    });

    it('should propagate errors from SettingsService', async () => {
      const error = new Error('Failed to set project ID');
      vi.mocked(SettingsService.setProjectId).mockRejectedValue(error);

      await expect(stateManager.setProjectId('test-project')).rejects.toThrow(
        'Failed to set project ID'
      );
      expect(SettingsService.setProjectId).toHaveBeenCalledWith('test-project');
    });

    it('should handle storage write errors', async () => {
      const storageError = new Error('Storage write failed');
      vi.mocked(SettingsService.setProjectId).mockRejectedValue(storageError);

      await expect(stateManager.setProjectId('project')).rejects.toThrow('Storage write failed');
    });

    it('should handle quota exceeded errors', async () => {
      const quotaError = new Error('QuotaExceededError: Storage quota exceeded');
      vi.mocked(SettingsService.setProjectId).mockRejectedValue(quotaError);

      await expect(stateManager.setProjectId('large-project')).rejects.toThrow(
        'QuotaExceededError'
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete workflow: get settings, get project ID, set project ID', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_token',
          repoOwner: 'testowner',
          projectSettings: {
            project1: { repoName: 'repo1', branch: 'main' },
          },
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);
      vi.mocked(SettingsService.getProjectId).mockResolvedValue('project1');
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      const settings = await stateManager.getGitHubSettings();
      expect(settings.isSettingsValid).toBe(true);

      const projectId = await stateManager.getProjectId();
      expect(projectId).toBe('project1');

      await stateManager.setProjectId('project2');

      expect(SettingsService.getGitHubSettings).toHaveBeenCalledTimes(1);
      expect(SettingsService.getProjectId).toHaveBeenCalledTimes(1);
      expect(SettingsService.setProjectId).toHaveBeenCalledWith('project2');
    });

    it('should handle project switching workflow', async () => {
      vi.mocked(SettingsService.getProjectId)
        .mockResolvedValueOnce('project1')
        .mockResolvedValueOnce('project2');
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      const initialProject = await stateManager.getProjectId();
      expect(initialProject).toBe('project1');

      await stateManager.setProjectId('project2');

      const newProject = await stateManager.getProjectId();
      expect(newProject).toBe('project2');
    });

    it('should handle multiple concurrent getGitHubSettings calls', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_token',
          repoOwner: 'owner',
          projectSettings: {},
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const [result1, result2, result3] = await Promise.all([
        stateManager.getGitHubSettings(),
        stateManager.getGitHubSettings(),
        stateManager.getGitHubSettings(),
      ]);

      expect(result1).toEqual(mockSettings);
      expect(result2).toEqual(mockSettings);
      expect(result3).toEqual(mockSettings);
      expect(SettingsService.getGitHubSettings).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid project ID changes', async () => {
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      await Promise.all([
        stateManager.setProjectId('project1'),
        stateManager.setProjectId('project2'),
        stateManager.setProjectId('project3'),
      ]);

      expect(SettingsService.setProjectId).toHaveBeenCalledTimes(3);
      expect(SettingsService.setProjectId).toHaveBeenCalledWith('project1');
      expect(SettingsService.setProjectId).toHaveBeenCalledWith('project2');
      expect(SettingsService.setProjectId).toHaveBeenCalledWith('project3');
    });

    it('should handle onboarding flow: no settings -> get invalid -> set project -> get valid', async () => {
      const invalidSettings: SettingsCheckResult = {
        isSettingsValid: false,
      };

      const validSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'ghp_newtoken',
          repoOwner: 'newuser',
          projectSettings: {
            'first-project': { repoName: 'first-repo', branch: 'main' },
          },
        },
      };

      vi.mocked(SettingsService.getGitHubSettings)
        .mockResolvedValueOnce(invalidSettings)
        .mockResolvedValueOnce(validSettings);
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(null);
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      const initialSettings = await stateManager.getGitHubSettings();
      expect(initialSettings.isSettingsValid).toBe(false);

      const initialProjectId = await stateManager.getProjectId();
      expect(initialProjectId).toBeNull();

      await stateManager.setProjectId('first-project');

      const updatedSettings = await stateManager.getGitHubSettings();
      expect(updatedSettings.isSettingsValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null project ID gracefully', async () => {
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(null);

      const result = await stateManager.getProjectId();

      expect(result).toBeNull();
    });

    it('should handle undefined return from SettingsService', async () => {
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(undefined as unknown as null);

      const result = await stateManager.getProjectId();

      expect(result).toBeUndefined();
    });

    it('should handle special characters in project ID', async () => {
      const specialProjectIds = [
        'project-with-dashes',
        'project_with_underscores',
        'project.with.dots',
        'project@with@at',
        'project#with#hash',
      ];

      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      for (const projectId of specialProjectIds) {
        await stateManager.setProjectId(projectId);
        expect(SettingsService.setProjectId).toHaveBeenCalledWith(projectId);
      }
    });

    it('should handle very long project ID', async () => {
      const longProjectId = 'a'.repeat(1000);
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      await stateManager.setProjectId(longProjectId);

      expect(SettingsService.setProjectId).toHaveBeenCalledWith(longProjectId);
    });

    it('should handle concurrent getProjectId calls', async () => {
      vi.mocked(SettingsService.getProjectId).mockResolvedValue('concurrent-project');

      const [result1, result2, result3] = await Promise.all([
        stateManager.getProjectId(),
        stateManager.getProjectId(),
        stateManager.getProjectId(),
      ]);

      expect(result1).toBe('concurrent-project');
      expect(result2).toBe('concurrent-project');
      expect(result3).toBe('concurrent-project');
    });

    it('should handle settings with missing optional fields', async () => {
      const minimalSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'token',
          repoOwner: 'owner',
          projectSettings: undefined as unknown as Record<
            string,
            { repoName: string; branch: string }
          >,
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(minimalSettings);

      const result = await stateManager.getGitHubSettings();

      expect(result.isSettingsValid).toBe(true);
      expect(result.gitHubSettings?.projectSettings).toBeUndefined();
    });

    it('should maintain singleton through error conditions', async () => {
      vi.mocked(SettingsService.getGitHubSettings).mockRejectedValue(new Error('First call error'));

      const instance1 = StateManager.getInstance();
      await expect(instance1.getGitHubSettings()).rejects.toThrow('First call error');

      const instance2 = StateManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Type Safety', () => {
    it('should return correct type for getGitHubSettings', async () => {
      const mockSettings: SettingsCheckResult = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'token',
          repoOwner: 'owner',
          projectSettings: {},
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const result = await stateManager.getGitHubSettings();

      expect(typeof result.isSettingsValid).toBe('boolean');
      if (result.gitHubSettings) {
        expect(typeof result.gitHubSettings.githubToken).toBe('string');
        expect(typeof result.gitHubSettings.repoOwner).toBe('string');
        expect(typeof result.gitHubSettings.projectSettings).toBe('object');
      }
    });

    it('should return correct type for getProjectId', async () => {
      vi.mocked(SettingsService.getProjectId).mockResolvedValue('project');

      const result = await stateManager.getProjectId();

      expect(typeof result).toBe('string');
    });

    it('should accept string parameter for setProjectId', async () => {
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      await expect(stateManager.setProjectId('valid-string')).resolves.toBeUndefined();
    });
  });
});
