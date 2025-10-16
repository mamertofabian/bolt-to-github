import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from '../StateManager';
import { SettingsService } from '../../services/settings';

vi.mock('../../services/settings', () => ({
  SettingsService: {
    getGitHubSettings: vi.fn(),
    getProjectId: vi.fn(),
    setProjectId: vi.fn(),
  },
}));

describe('StateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance across multiple calls', () => {
      const instance1 = StateManager.getInstance();
      const instance2 = StateManager.getInstance();
      const instance3 = StateManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('Delegation to SettingsService', () => {
    it('should delegate getGitHubSettings to SettingsService', async () => {
      const mockSettings = {
        isSettingsValid: true,
        gitHubSettings: {
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: {},
        },
      };

      vi.mocked(SettingsService.getGitHubSettings).mockResolvedValue(mockSettings);

      const stateManager = StateManager.getInstance();
      const result = await stateManager.getGitHubSettings();

      expect(SettingsService.getGitHubSettings).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockSettings);
    });

    it('should delegate getProjectId to SettingsService', async () => {
      const mockProjectId = 'test-project';
      vi.mocked(SettingsService.getProjectId).mockResolvedValue(mockProjectId);

      const stateManager = StateManager.getInstance();
      const result = await stateManager.getProjectId();

      expect(SettingsService.getProjectId).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockProjectId);
    });

    it('should delegate setProjectId to SettingsService', async () => {
      vi.mocked(SettingsService.setProjectId).mockResolvedValue(undefined);

      const stateManager = StateManager.getInstance();
      const projectId = 'new-project';
      await stateManager.setProjectId(projectId);

      expect(SettingsService.setProjectId).toHaveBeenCalledTimes(1);
      expect(SettingsService.setProjectId).toHaveBeenCalledWith(projectId);
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors from SettingsService.getGitHubSettings', async () => {
      const error = new Error('Failed to retrieve settings');
      vi.mocked(SettingsService.getGitHubSettings).mockRejectedValue(error);

      const stateManager = StateManager.getInstance();
      await expect(stateManager.getGitHubSettings()).rejects.toThrow('Failed to retrieve settings');
    });

    it('should propagate errors from SettingsService.getProjectId', async () => {
      const error = new Error('Failed to get project ID');
      vi.mocked(SettingsService.getProjectId).mockRejectedValue(error);

      const stateManager = StateManager.getInstance();
      await expect(stateManager.getProjectId()).rejects.toThrow('Failed to get project ID');
    });

    it('should propagate errors from SettingsService.setProjectId', async () => {
      const error = new Error('Failed to set project ID');
      vi.mocked(SettingsService.setProjectId).mockRejectedValue(error);

      const stateManager = StateManager.getInstance();
      await expect(stateManager.setProjectId('test')).rejects.toThrow('Failed to set project ID');
    });
  });
});
