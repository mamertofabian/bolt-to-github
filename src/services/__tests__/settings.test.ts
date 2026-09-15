import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeStorageService } from '../../lib/services/chromeStorage';
import type { GitHubSettingsInterface, ProjectSettings } from '../../lib/types';
import { SettingsService } from '../settings';

vi.mock('../../lib/services/chromeStorage');
vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const projectSettings: ProjectSettings = {
  'test-project': { repoName: 'test-repo', branch: 'main' },
};

function connectedSettings(
  overrides: Partial<GitHubSettingsInterface> = {}
): GitHubSettingsInterface {
  return {
    repoOwner: 'octocat',
    projectSettings,
    githubAppInstallationId: 12345,
    githubAppUsername: 'octocat',
    ...overrides,
  };
}

describe('SettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('test-project');
    vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(connectedSettings());
    vi.mocked(ChromeStorageService.saveProjectSettings).mockResolvedValue(undefined);
  });

  describe('getGitHubSettings', () => {
    it('returns valid GitHub App settings for the active project', async () => {
      await expect(SettingsService.getGitHubSettings()).resolves.toEqual({
        isSettingsValid: true,
        gitHubSettings: connectedSettings(),
      });
    });

    it('returns App metadata without PAT credential or selector fields', async () => {
      const result = await SettingsService.getGitHubSettings();

      expect(result.gitHubSettings).toEqual(
        expect.objectContaining({ githubAppInstallationId: 12345, repoOwner: 'octocat' })
      );
      expect(result.gitHubSettings).not.toHaveProperty('githubToken');
      expect(result.gitHubSettings).not.toHaveProperty('authenticationMethod');
    });

    it('requires installation metadata', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        connectedSettings({ githubAppInstallationId: undefined })
      );

      await expect(SettingsService.getGitHubSettings()).resolves.toEqual(
        expect.objectContaining({ isSettingsValid: false })
      );
    });

    it('requires a repository owner', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        connectedSettings({ repoOwner: '' })
      );

      await expect(SettingsService.getGitHubSettings()).resolves.toEqual(
        expect.objectContaining({ isSettingsValid: false })
      );
    });

    it('auto-creates project settings when App connection and owner exist', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        connectedSettings({ projectSettings: {} })
      );
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('new-project');

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

    it('does not auto-create project settings without installation metadata', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        connectedSettings({ projectSettings: {}, githubAppInstallationId: undefined })
      );

      const result = await SettingsService.getGitHubSettings('new-project');

      expect(ChromeStorageService.saveProjectSettings).not.toHaveBeenCalled();
      expect(result.isSettingsValid).toBe(false);
    });

    it('prefers the provided project ID', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        connectedSettings({
          projectSettings: {
            'stored-project': { repoName: 'stored', branch: 'main' },
            'provided-project': { repoName: 'provided', branch: 'dev' },
          },
        })
      );
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue('stored-project');

      await expect(SettingsService.getGitHubSettings('provided-project')).resolves.toEqual(
        expect.objectContaining({ isSettingsValid: true })
      );
    });

    it('is invalid when no project is active', async () => {
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockResolvedValue(null);
      await expect(SettingsService.getGitHubSettings()).resolves.toEqual(
        expect.objectContaining({ isSettingsValid: false })
      );
    });

    it('fails visibly as invalid on storage errors', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockRejectedValue(
        new Error('storage unavailable')
      );
      await expect(SettingsService.getGitHubSettings()).resolves.toEqual({
        isSettingsValid: false,
      });
    });

    it('does not claim validity when project creation storage fails', async () => {
      vi.mocked(ChromeStorageService.getGitHubSettings).mockResolvedValue(
        connectedSettings({ projectSettings: {} })
      );
      vi.mocked(ChromeStorageService.saveProjectSettings).mockRejectedValue(
        new Error('write unavailable')
      );

      await expect(SettingsService.getGitHubSettings('new-project')).resolves.toEqual({
        isSettingsValid: false,
      });
    });
  });

  describe('project ID storage', () => {
    it('gets the current project ID', async () => {
      await expect(SettingsService.getProjectId()).resolves.toBe('test-project');
    });

    it('returns null when project ID storage fails', async () => {
      vi.mocked(ChromeStorageService.getCurrentProjectId).mockRejectedValue(new Error('storage'));
      await expect(SettingsService.getProjectId()).resolves.toBeNull();
    });

    it('saves the current project ID', async () => {
      vi.mocked(ChromeStorageService.saveCurrentProjectId).mockResolvedValue(undefined);
      await SettingsService.setProjectId('next-project');
      expect(ChromeStorageService.saveCurrentProjectId).toHaveBeenCalledWith('next-project');
    });

    it('does not reject when project ID storage fails', async () => {
      vi.mocked(ChromeStorageService.saveCurrentProjectId).mockRejectedValue(new Error('storage'));
      await expect(SettingsService.setProjectId('next-project')).resolves.toBeUndefined();
    });
  });
});
