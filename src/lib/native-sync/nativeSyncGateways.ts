/**
 * Production gateway adapters for native-sync repository adoption.
 *
 * Child 02's adoption coordinator (nativeSyncRepositoryAdoption.ts) depends on
 * three injectable gateways so its staged, idempotent adoption stays testable.
 * This module supplies the production adapters over narrow, fakeable
 * sub-gateways, owning the real transformation logic:
 *
 * - createRepositoryCandidateSource: converts the authenticated user's
 *   repository listing into owner-scoped, epoch-timestamped candidates so child
 *   02's pure ranking stays owner-scoped and newest-first.
 * - createRepositoryAccessVerifier: resolves true only when a repository exists
 *   AND contains the selected branch, short-circuiting on a missing repository.
 * - createProjectMappingWriter: updates only a project's repo and branch while
 *   preserving its existing title, so adoption never blanks a project title or
 *   touches unrelated projects.
 *
 * These adapters take narrow injected sub-gateways rather than
 * UnifiedGitHubService / ChromeStorageService directly. The composition root
 * that narrows those real services (reusing the existing live GitHub connection
 * gate) and assembles AdoptionDeps belongs to the UI slice (child 03b).
 */

import type { RepositoryCandidateInput } from './nativeSyncAdoption';
import type {
  ProjectMappingWriter,
  RepositoryCandidateSource,
} from './nativeSyncRepositoryAdoption';

/** Minimal repository listing shape the candidate adapter consumes, structurally satisfied by RepoSummary. */
export interface GitHubRepoListEntry {
  name: string;
  created_at: string;
}

/** Minimal branch shape the access checker consumes. */
export interface GitHubBranchName {
  name: string;
}

/** Narrow gateway that lists the authenticated user's repositories for candidate discovery. */
export interface RepositoryLister {
  listRepos: () => Promise<GitHubRepoListEntry[]>;
}

/** Narrow gateway used to confirm a repository exists and contains the selected branch. */
export interface RepositoryAccessChecker {
  repoExists: (owner: string, repo: string) => Promise<boolean>;
  listBranches: (owner: string, repo: string) => Promise<GitHubBranchName[]>;
}

/** Narrow gateway to read the current project title and persist a project-scoped repo/branch mapping. */
export interface ProjectSettingsGateway {
  getProjectTitle: (projectId: string) => Promise<string | undefined>;
  saveProjectSettings: (
    projectId: string,
    repoName: string,
    branch: string,
    projectTitle?: string
  ) => Promise<void>;
}

/**
 * Adapt a RepositoryLister into a child-02 RepositoryCandidateSource, stamping
 * the requested owner on each entry and converting the ISO created_at to epoch
 * ms so child-02 ranking stays owner-scoped and newest-first.
 */
export function createRepositoryCandidateSource(
  lister: RepositoryLister
): RepositoryCandidateSource {
  return {
    async listOwnerRepositories(owner: string): Promise<RepositoryCandidateInput[]> {
      const repos = await lister.listRepos();
      return repos.map((repo) => ({
        owner,
        name: repo.name,
        createdAt: Date.parse(repo.created_at),
      }));
    },
  };
}

/**
 * Build the verifyRepositoryAccess callback child 02 injects: resolves true only
 * when the repository exists AND the selected branch is present, and
 * short-circuits to false (without a branch lookup) when the repository is
 * missing.
 */
export function createRepositoryAccessVerifier(
  checker: RepositoryAccessChecker
): (owner: string, repo: string, branch: string) => Promise<boolean> {
  return async (owner: string, repo: string, branch: string): Promise<boolean> => {
    if (!(await checker.repoExists(owner, repo))) {
      return false;
    }
    const branches = await checker.listBranches(owner, repo);
    return branches.some((candidate) => candidate.name === branch);
  };
}

/**
 * Adapt a ProjectSettingsGateway into a child-02 ProjectMappingWriter that
 * changes only repoName and branch for the given project while preserving the
 * existing project title (including undefined).
 */
export function createProjectMappingWriter(gateway: ProjectSettingsGateway): ProjectMappingWriter {
  return {
    async setProjectMapping(projectId: string, repoName: string, branch: string): Promise<void> {
      const projectTitle = await gateway.getProjectTitle(projectId);
      await gateway.saveProjectSettings(projectId, repoName, branch, projectTitle);
    },
  };
}
