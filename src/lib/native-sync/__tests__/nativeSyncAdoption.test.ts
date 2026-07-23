import { describe, it, expect } from 'vitest';
import { rankAdoptionCandidates } from '../nativeSyncAdoption';
import type {
  RepositoryCandidateInput,
  NativeSyncRepositoryCandidate,
  NativeSyncCandidateResult,
  NativeSyncCandidateStatus,
  NativeSyncCandidateMode,
} from '../nativeSyncAdoption';
import type { NativeSyncHandoffRecord } from '../nativeSyncHandoff';

/**
 * A completed private import handoff record. The original private repo is
 * 'my-private-repo', the temporary import repo is 'temp-abc123', the owner is
 * 'octocat', and the import completed at t=1000.
 */
const aHandoff = (over: Partial<NativeSyncHandoffRecord> = {}): NativeSyncHandoffRecord => ({
  schemaVersion: 2,
  projectId: 'final-project-1',
  originalRepo: 'my-private-repo',
  tempRepo: 'temp-abc123',
  owner: 'octocat',
  branch: 'main',
  status: 'pending',
  createdAt: 1000,
  updatedAt: 1000,
  adoption: null,
  ...over,
});

const repo = (over: Partial<RepositoryCandidateInput> = {}): RepositoryCandidateInput => ({
  owner: 'octocat',
  name: 'bolt-created',
  createdAt: 2000,
  ...over,
});

describe('rankAdoptionCandidates', () => {
  it('rankAdoptionCandidates excludes the original and temporary repositories', () => {
    const repos: RepositoryCandidateInput[] = [
      repo({ name: 'my-private-repo' }),
      repo({ name: 'temp-abc123' }),
      repo({ name: 'bolt-created' }),
    ];

    const result: NativeSyncCandidateResult = rankAdoptionCandidates(
      repos,
      aHandoff(),
      'suggested',
      null
    );

    const names = result.candidates.map((c) => c.name);
    expect(names).not.toContain('my-private-repo');
    expect(names).not.toContain('temp-abc123');
    expect(names).toContain('bolt-created');
  });

  it('rankAdoptionCandidates excludes repositories owned by a different owner', () => {
    const repos: RepositoryCandidateInput[] = [
      repo({ owner: 'some-org', name: 'org-repo' }),
      repo({ owner: 'octocat', name: 'mine' }),
    ];

    const result = rankAdoptionCandidates(repos, aHandoff(), 'suggested', null);

    const names = result.candidates.map((c) => c.name);
    expect(names).toEqual(['mine']);
  });

  it('rankAdoptionCandidates omits pre-handoff repositories in suggested mode', () => {
    const repos: RepositoryCandidateInput[] = [
      repo({ name: 'old-repo', createdAt: 500 }),
      repo({ name: 'new-repo', createdAt: 1500 }),
    ];

    const mode: NativeSyncCandidateMode = 'suggested';
    const result = rankAdoptionCandidates(repos, aHandoff(), mode, null);

    const names = result.candidates.map((c) => c.name);
    expect(names).toEqual(['new-repo']);
  });

  it('rankAdoptionCandidates includes a pre-handoff repository flagged in search mode', () => {
    const repos: RepositoryCandidateInput[] = [repo({ name: 'old-repo', createdAt: 500 })];

    const result = rankAdoptionCandidates(repos, aHandoff(), 'search', 'old');

    const candidate: NativeSyncRepositoryCandidate = result.candidates[0];
    expect(candidate.name).toBe('old-repo');
    expect(candidate.createdBeforeHandoff).toBe(true);
  });

  it('rankAdoptionCandidates reports none for zero eligible repositories', () => {
    const repos: RepositoryCandidateInput[] = [repo({ name: 'my-private-repo' })];

    const result = rankAdoptionCandidates(repos, aHandoff(), 'suggested', null);

    const status: NativeSyncCandidateStatus = result.status;
    expect(status).toBe('none');
    expect(result.candidates).toHaveLength(0);
  });

  it('rankAdoptionCandidates reports single for exactly one eligible repository', () => {
    const repos: RepositoryCandidateInput[] = [repo({ name: 'bolt-created', createdAt: 2000 })];

    const result = rankAdoptionCandidates(repos, aHandoff(), 'suggested', null);

    expect(result.status).toBe('single');
    expect(result.candidates).toHaveLength(1);
  });

  it('rankAdoptionCandidates reports multiple and sorts newest first', () => {
    const repos: RepositoryCandidateInput[] = [
      repo({ name: 'older', createdAt: 1500 }),
      repo({ name: 'newer', createdAt: 3000 }),
    ];

    const result = rankAdoptionCandidates(repos, aHandoff(), 'suggested', null);

    expect(result.status).toBe('multiple');
    expect(result.candidates.map((c) => c.name)).toEqual(['newer', 'older']);
  });
});
