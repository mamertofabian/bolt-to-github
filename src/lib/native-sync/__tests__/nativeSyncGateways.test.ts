import { describe, it, expect, vi } from 'vitest';
import {
  createRepositoryCandidateSource,
  createRepositoryAccessVerifier,
  createProjectMappingWriter,
  type GitHubRepoListEntry,
  type GitHubBranchName,
  type RepositoryLister,
  type RepositoryAccessChecker,
  type ProjectSettingsGateway,
} from '../nativeSyncGateways';
import { rankAdoptionCandidates } from '../nativeSyncAdoption';
import type {
  RepositoryCandidateSource,
  ProjectMappingWriter,
} from '../nativeSyncRepositoryAdoption';
import type { NativeSyncHandoffRecord } from '../nativeSyncHandoff';

function makeHandoff(overrides: Partial<NativeSyncHandoffRecord> = {}): NativeSyncHandoffRecord {
  return {
    schemaVersion: 2,
    projectId: 'project-1',
    originalRepo: 'source-repo',
    tempRepo: 'temp-clone',
    owner: 'octocat',
    branch: 'main',
    status: 'pending',
    createdAt: Date.parse('2026-07-01T00:00:00.000Z'),
    updatedAt: Date.parse('2026-07-01T00:00:00.000Z'),
    adoption: null,
    ...overrides,
  };
}

describe('createRepositoryCandidateSource', () => {
  it('createRepositoryCandidateSource stamps the requested owner and converts ISO created_at to epoch ms', async () => {
    const entry: GitHubRepoListEntry = { name: 'bolt-abc', created_at: '2026-07-20T00:00:00.000Z' };
    const lister: RepositoryLister = {
      listRepos: async (): Promise<GitHubRepoListEntry[]> => [entry],
    };

    const source: RepositoryCandidateSource = createRepositoryCandidateSource(lister);
    const candidates = await source.listOwnerRepositories('octocat');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].owner).toBe('octocat');
    expect(candidates[0].name).toBe('bolt-abc');
    expect(candidates[0].createdAt).toBe(Date.parse('2026-07-20T00:00:00.000Z'));
  });

  it('createRepositoryCandidateSource output feeds child-02 ranking so the original and temporary repositories are excluded', async () => {
    const handoff = makeHandoff();
    const lister: RepositoryLister = {
      listRepos: async (): Promise<GitHubRepoListEntry[]> => [
        { name: 'source-repo', created_at: '2026-06-01T00:00:00.000Z' },
        { name: 'temp-clone', created_at: '2026-07-01T00:00:00.000Z' },
        { name: 'bolt-new', created_at: '2026-07-15T00:00:00.000Z' },
      ],
    };

    const source = createRepositoryCandidateSource(lister);
    const ranked = rankAdoptionCandidates(
      await source.listOwnerRepositories('octocat'),
      handoff,
      'suggested',
      null
    );

    expect(ranked.status).toBe('single');
    expect(ranked.candidates.map((candidate) => candidate.name)).toEqual(['bolt-new']);
  });
});

describe('createRepositoryAccessVerifier', () => {
  it('createRepositoryAccessVerifier resolves false when the repository does not exist', async () => {
    const listBranches = vi.fn(async (): Promise<GitHubBranchName[]> => [{ name: 'main' }]);
    const checker: RepositoryAccessChecker = {
      repoExists: async () => false,
      listBranches,
    };

    const verify = createRepositoryAccessVerifier(checker);

    expect(await verify('octocat', 'ghost-repo', 'main')).toBe(false);
    // A missing repository short-circuits: no branch lookup is attempted.
    expect(listBranches).not.toHaveBeenCalled();
  });

  it('createRepositoryAccessVerifier resolves false when the branch is absent from an existing repository', async () => {
    const checker: RepositoryAccessChecker = {
      repoExists: async () => true,
      listBranches: async (): Promise<GitHubBranchName[]> => [{ name: 'develop' }],
    };

    const verify = createRepositoryAccessVerifier(checker);

    expect(await verify('octocat', 'bolt-new', 'main')).toBe(false);
  });

  it('createRepositoryAccessVerifier resolves true when the repository exists and contains the branch', async () => {
    const mainBranch: GitHubBranchName = { name: 'main' };
    const checker: RepositoryAccessChecker = {
      repoExists: async () => true,
      listBranches: async (): Promise<GitHubBranchName[]> => [mainBranch, { name: 'develop' }],
    };

    const verify = createRepositoryAccessVerifier(checker);

    expect(await verify('octocat', 'bolt-new', 'main')).toBe(true);
  });
});

describe('createProjectMappingWriter', () => {
  it('createProjectMappingWriter updates only repo and branch and preserves the existing project title', async () => {
    const saveProjectSettings = vi.fn(async () => {});
    const gateway: ProjectSettingsGateway = {
      getProjectTitle: async () => 'My Cool Project',
      saveProjectSettings,
    };

    const writer: ProjectMappingWriter = createProjectMappingWriter(gateway);
    await writer.setProjectMapping('project-1', 'bolt-new', 'main');

    expect(saveProjectSettings.mock.calls).toHaveLength(1);
    expect(saveProjectSettings.mock.calls[0]).toEqual([
      'project-1',
      'bolt-new',
      'main',
      'My Cool Project',
    ]);
  });

  it('createProjectMappingWriter passes through an undefined title without inventing one', async () => {
    const saveProjectSettings = vi.fn(async () => {});
    const gateway: ProjectSettingsGateway = {
      getProjectTitle: async () => undefined,
      saveProjectSettings,
    };

    const writer = createProjectMappingWriter(gateway);
    await writer.setProjectMapping('project-1', 'bolt-new', 'main');

    expect(saveProjectSettings.mock.calls[0]).toEqual(['project-1', 'bolt-new', 'main', undefined]);
  });
});
