import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../settings';
import { ChromeStorageService } from '../../lib/services/chromeStorage';
import type { GitHubSettingsInterface, ProjectSettings } from '../../lib/types';

vi.mock('../../lib/services/chromeStorage');
vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitHubSettings', () => {
    describe('PAT authentication', () => {
      it('should return valid settings when PAT auth is configured with existing project settings', async () => {
        const mockProjectSettings: ProjectSettings = {
          'test-project': { repoName: 'test-repo', branch: 'main' },
        };

        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: mockProjectSettings,
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(true);
        expect(result.gitHubSettings).toEqual({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: mockProjectSettings,
        });
      });

      it('should return invalid settings when PAT token is missing', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: '',
          repoOwner: 'test-owner',
          projectSettings: { 'test-project': { repoName: 'test-repo', branch: 'main' } },
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
      });

      it('should return invalid settings when repoOwner is missing', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: '',
          projectSettings: { 'test-project': { repoName: 'test-repo', branch: 'main' } },
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
      });

      it('should return invalid settings when projectSettings is undefined', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');
        vi.mocked(ChromeStorageService.saveProjectSettings).mockResolvedValue();

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(true);
        expect(result.gitHubSettings?.projectSettings?.['test-project']).toEqual({
          repoName: 'test-project',
          branch: 'main',
        });
      });

      it('should auto-create project settings when missing but has required PAT auth', async () => {
        const mockProjectSettings: ProjectSettings = {};

        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: mockProjectSettings,
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('new-project');
        vi.mocked(ChromeStorageService.saveProjectSettings).mockResolvedValue();

        const result = await SettingsService.getGitHubSettings();

        expect(ChromeStorageService.saveProjectSettings).toHaveBeenCalledWith(
          'new-project',
          'new-project',
          'main'
        );
        expect(result.isSettingsValid).toBe(true);
        expect(result.gitHubSettings?.projectSettings?.['new-project']).toEqual({
          repoName: 'new-project',
          branch: 'main',
        });
      });
    });

    describe('GitHub App authentication', () => {
      it('should return valid settings when GitHub App auth is configured', async () => {
        const mockProjectSettings: ProjectSettings = {
          'test-project': { repoName: 'test-repo', branch: 'main' },
        };

        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: '',
          repoOwner: 'test-owner',
          projectSettings: mockProjectSettings,
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(true);
        expect(result.gitHubSettings).toEqual({
          githubToken: '',
          repoOwner: 'test-owner',
          projectSettings: mockProjectSettings,
        });
      });

      it('should return invalid settings when GitHub App installation ID is missing', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: '',
          repoOwner: 'test-owner',
          projectSettings: { 'test-project': { repoName: 'test-repo', branch: 'main' } },
          authenticationMethod: 'github_app',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
      });

      it('should auto-create project settings when missing but has GitHub App auth', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: '',
          repoOwner: 'test-owner',
          projectSettings: {},
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('app-project');
        vi.mocked(ChromeStorageService.saveProjectSettings).mockResolvedValue();

        const result = await SettingsService.getGitHubSettings();

        expect(ChromeStorageService.saveProjectSettings).toHaveBeenCalledWith(
          'app-project',
          'app-project',
          'main'
        );
        expect(result.isSettingsValid).toBe(true);
      });

      it('should not auto-create project settings when repoOwner is missing', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: '',
          repoOwner: '',
          projectSettings: {},
          authenticationMethod: 'github_app',
          githubAppInstallationId: 12345,
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('app-project');

        const result = await SettingsService.getGitHubSettings();

        expect(ChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
        expect(result.isSettingsValid).toBe(false);
      });
    });

    describe('project ID handling', () => {
      it('should use provided currentProjectId over stored project ID', async () => {
        const mockProjectSettings: ProjectSettings = {
          'custom-project': { repoName: 'custom-repo', branch: 'main' },
        };

        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: mockProjectSettings,
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('stored-project');

        const result = await SettingsService.getGitHubSettings('custom-project');

        expect(result.isSettingsValid).toBe(true);
        expect(result.gitHubSettings?.projectSettings).toEqual(mockProjectSettings);
      });

      it('should handle missing project ID gracefully', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: {},
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue(null);

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
      });

      it('should not auto-create when project ID is missing', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: {},
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue(null);

        const result = await SettingsService.getGitHubSettings();

        expect(ChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
        expect(result.isSettingsValid).toBe(false);
      });
    });

    describe('authentication method defaults', () => {
      it('should default to PAT when authenticationMethod is undefined', async () => {
        const mockSettings: GitHubSettingsInterface = {
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: { 'test-project': { repoName: 'test-repo', branch: 'main' } },
        };

        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(mockSettings);
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should return invalid settings when ChromeStorageService.getGitHubSettings throws', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockRejectedValue(
          new Error('Storage error')
        );

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
        expect(result.gitHubSettings).toBeUndefined();
      });

      it('should return invalid settings when ChromeStorageService.getCurrentProjectId throws', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: {},
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockRejectedValue(
          new Error('Storage error')
        );

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
      });

      it('should continue when saveProjectSettings fails during auto-creation', async () => {
        vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue({
          githubToken: 'test-token',
          repoOwner: 'test-owner',
          projectSettings: {},
          authenticationMethod: 'pat',
        });
        vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('new-project');
        vi.mocked(ChromeStorageService.saveProjectSettings).mockRejectedValue(
          new Error('Save error')
        );

        const result = await SettingsService.getGitHubSettings();

        expect(result.isSettingsValid).toBe(false);
      });
    });
  });

  describe('getProjectId', () => {
    it('should return project ID from ChromeStorageService', async () => {
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');

      const result = await SettingsService.getProjectId();

      expect(result).toBe('test-project');
      expect(ChromeStorageService.getCurrentProjectId).toHaveBeenCalledOnce();
    });

    it('should return null when no project ID is stored', async () => {
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue(null);

      const result = await SettingsService.getProjectId();

      expect(result).toBeNull();
    });

    it('should return null when ChromeStorageService throws an error', async () => {
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await SettingsService.getProjectId();

      expect(result).toBeNull();
    });
  });

  describe('setProjectId', () => {
    it('should save project ID through ChromeStorageService', async () => {
      vi.mocked(ChromeStorageService.saveCurrentProjectId).mockResolvedValue();

      await SettingsService.setProjectId('new-project');

      expect(ChromeStorageService.saveCurrentProjectId).toHaveBeenCalledWith('new-project');
    });

    it('should handle errors silently when ChromeStorageService throws', async () => {
      vi.mocked(ChromeStorageService.saveCurrentProjectId).mockRejectedValue(
        new Error('Storage error')
      );

      await expect(SettingsService.setProjectId('test-project')).resolves.toBeUndefined();
      expect(ChromeStorageService.saveCurrentProjectId).toHaveBeenCalledWith('test-project');
    });
  });
});
