/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import CommitsModal from '../CommitsModal.svelte';

vi.unmock('$lib/components/ui/modal/Modal.svelte');
vi.unmock('lucide-svelte');

const mocks = vi.hoisted(() => ({
  createConnectedGitHubAppService: vi.fn(),
  serviceConstructor: vi.fn(),
  fetchCommits: vi.fn(),
}));

vi.mock('../../../services/UnifiedGitHubService', () => ({
  UnifiedGitHubService: mocks.serviceConstructor,
}));

vi.mock('$lib/utils/connectedGitHubAppService', () => ({
  createConnectedGitHubAppService: mocks.createConnectedGitHubAppService,
}));

vi.mock('../../services/CommitsService', () => ({
  CommitsService: vi.fn(() => ({
    fetchCommits: mocks.fetchCommits,
    filterCommits: vi.fn((commits) => commits),
  })),
}));

vi.mock('$lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('CommitsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceConstructor.mockImplementation((config) => ({ config }));
    mocks.createConnectedGitHubAppService.mockImplementation(async () =>
      mocks.serviceConstructor({ type: 'github_app' })
    );
    mocks.fetchCommits.mockResolvedValue({ commits: [], hasMore: false });

    Object.defineProperty(window, 'chrome', {
      value: {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
          },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('commits modal loads through GitHub App without a token prop', async () => {
    render(CommitsModal, {
      props: {
        show: true,
        repoOwner: 'octocat',
        repoName: 'hello-world',
        branch: 'main',
      },
    });

    await waitFor(() => {
      expect(mocks.fetchCommits).toHaveBeenCalledOnce();
    });
    expect(mocks.createConnectedGitHubAppService).toHaveBeenCalledOnce();
    expect(mocks.serviceConstructor).toHaveBeenCalledWith({ type: 'github_app' });
    expect(mocks.serviceConstructor).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('disconnected commits modal verifies once and preserves the connection guidance', async () => {
    mocks.createConnectedGitHubAppService.mockRejectedValueOnce(
      new Error('Sign in to bolt2github.com and connect the GitHub App.')
    );

    render(CommitsModal, {
      props: {
        show: true,
        repoOwner: 'octocat',
        repoName: 'hello-world',
        branch: 'main',
      },
    });

    expect(
      await screen.findByText('Sign in to bolt2github.com and connect the GitHub App.')
    ).toBeInTheDocument();
    expect(mocks.createConnectedGitHubAppService).toHaveBeenCalledOnce();
    expect(mocks.fetchCommits).not.toHaveBeenCalled();
  });
});
