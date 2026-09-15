import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkGitHubConnection: vi.fn(),
  unifiedGitHubService: vi.fn(),
}));

vi.mock('../githubConnection', () => ({
  checkGitHubConnection: mocks.checkGitHubConnection,
}));

vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: mocks.unifiedGitHubService,
}));

import { createConnectedGitHubAppService } from '../connectedGitHubAppService';

describe('createConnectedGitHubAppService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unifiedGitHubService.mockImplementation((config) => ({ config }));
  });

  it('creates GitHub App service only after live connection verification', async () => {
    mocks.checkGitHubConnection.mockResolvedValue({
      connected: true,
      message: 'GitHub is connected.',
    });

    await expect(createConnectedGitHubAppService()).resolves.toEqual({
      config: { type: 'github_app' },
    });
    expect(mocks.checkGitHubConnection).toHaveBeenCalledOnce();
    expect(mocks.unifiedGitHubService).toHaveBeenCalledWith({ type: 'github_app' });
  });

  it('rejects disconnected repository work before service construction', async () => {
    mocks.checkGitHubConnection.mockResolvedValue({
      connected: false,
      reason: 'migration_required',
      message: 'Connect the GitHub App to continue.',
    });

    await expect(createConnectedGitHubAppService()).rejects.toThrow(
      'Connect the GitHub App to continue.'
    );
    expect(mocks.unifiedGitHubService).not.toHaveBeenCalled();
  });
});
