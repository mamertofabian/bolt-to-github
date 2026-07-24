/**
 * Deps assembler for the native-sync handoff controller.
 *
 * buildAdoptionDeps wires 03a's gateway adapters
 * (createRepositoryCandidateSource / createRepositoryAccessVerifier /
 * createProjectMappingWriter) over an injected NativeSyncAdoptionEnvironment and
 * returns child 02's AdoptionDeps. Taking the environment as an argument keeps
 * this layer testable with fakes; the real-service environment
 * (createConnectedGitHubAppService + ChromeStorageService + the chrome-local
 * stores) is assembled by the UI slice (child 03b-ii).
 *
 * sanitizeRepoListEntries is the defensive guard the 03a implementation review
 * flagged: a repository whose created_at does not parse would otherwise become a
 * NaN timestamp and be silently excluded from suggested ranking. Instead such
 * entries are dropped by name and reported, and buildAdoptionDeps logs them so a
 * malformed timestamp is visible rather than hidden.
 */

import { createLogger } from '../utils/logger';
import {
  createProjectMappingWriter,
  createRepositoryAccessVerifier,
  createRepositoryCandidateSource,
} from './nativeSyncGateways';
import type {
  GitHubBranchName,
  GitHubRepoListEntry,
  ProjectSettingsGateway,
  RepositoryLister,
} from './nativeSyncGateways';
import type { AdoptionDeps } from './nativeSyncRepositoryAdoption';
import type { NativeSyncHandoffStore } from '../services/NativeSyncHandoffStore';
import type { NativeSyncJourneyStore } from '../services/NativeSyncJourneyStore';

const logger = createLogger('nativeSyncAdoptionDeps');

/** Narrow GitHub surface the deps assembler needs; structurally satisfied by UnifiedGitHubService in 03b-ii. */
export interface NativeSyncGitHubService {
  listRepos: () => Promise<GitHubRepoListEntry[]>;
  repoExists: (owner: string, repo: string) => Promise<boolean>;
  listBranches: (owner: string, repo: string) => Promise<GitHubBranchName[]>;
}

/** Injected collaborators buildAdoptionDeps assembles into child-02 AdoptionDeps. */
export interface NativeSyncAdoptionEnvironment {
  gitHubService: NativeSyncGitHubService;
  projectSettings: ProjectSettingsGateway;
  journeyStore: NativeSyncJourneyStore;
  handoffStore: NativeSyncHandoffStore;
}

/** The valid repository entries plus the names dropped for an unparseable created_at. */
export interface RepoListSanitizeResult {
  valid: GitHubRepoListEntry[];
  dropped: string[];
}

/**
 * Partition repository entries into those with a parseable ISO created_at (valid)
 * and the names of those without (dropped). Never emits an entry whose created_at
 * would become NaN downstream in the candidate ranking.
 */
export function sanitizeRepoListEntries(entries: GitHubRepoListEntry[]): RepoListSanitizeResult {
  const valid: GitHubRepoListEntry[] = [];
  const dropped: string[] = [];
  for (const entry of entries) {
    if (Number.isNaN(Date.parse(entry.created_at))) {
      dropped.push(entry.name);
    } else {
      valid.push(entry);
    }
  }
  return { valid, dropped };
}

/**
 * Assemble child-02 AdoptionDeps from the injected environment: a candidate
 * source over a sanitized repository lister, a live-access verifier, a
 * project-mapping writer, and the two provided stores. Dropped-timestamp entries
 * are logged so a malformed created_at is visible in this layer.
 */
export function buildAdoptionDeps(env: NativeSyncAdoptionEnvironment): AdoptionDeps {
  const lister: RepositoryLister = {
    listRepos: async (): Promise<GitHubRepoListEntry[]> => {
      const { valid, dropped } = sanitizeRepoListEntries(await env.gitHubService.listRepos());
      if (dropped.length > 0) {
        logger.warn(
          `Dropped ${dropped.length} repository/repositories with an unparseable created_at: ${dropped.join(', ')}`
        );
      }
      return valid;
    },
  };

  return {
    journeyStore: env.journeyStore,
    handoffStore: env.handoffStore,
    candidateSource: createRepositoryCandidateSource(lister),
    verifyRepositoryAccess: createRepositoryAccessVerifier({
      repoExists: (owner, repo) => env.gitHubService.repoExists(owner, repo),
      listBranches: (owner, repo) => env.gitHubService.listBranches(owner, repo),
    }),
    mappingWriter: createProjectMappingWriter(env.projectSettings),
  };
}
