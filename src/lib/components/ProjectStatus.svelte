<script lang="ts">
  import IssueManager from '$lib/components/IssueManager.svelte';
  import QuickIssueForm from '$lib/components/QuickIssueForm.svelte';
  import RepoSettings from '$lib/components/RepoSettings.svelte';
  import { issuesStore } from '$lib/stores/issuesStore';
  import { isPremium } from '$lib/stores/premiumStore';
  import { createLogger } from '$lib/utils/logger';
  import type { UpgradeModalType } from '$lib/utils/upgradeModal';
  import type { GitHubCommit } from 'src/services/types/repository';
  import { createEventDispatcher, onMount } from 'svelte';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';

  const logger = createLogger('ProjectStatus');
  const dispatch = createEventDispatcher();

  export let projectId: string;
  export let gitHubUsername: string;
  export let repoName: string;
  export let branch: string;
  export let token: string;
  export let projectTitle: string = 'My Project';
  export let handleUpgradeClick: (upgradeModalType: UpgradeModalType) => void;

  let showSettingsModal = false;
  let hasFileChanges = false;
  let showIssueManager = false;
  let showQuickIssueForm = false;
  let effectiveToken = '';

  // Premium status
  $: isUserPremium = $isPremium;

  // Issues count from store
  $: openIssuesCountStore = issuesStore.getOpenIssuesCount(gitHubUsername, repoName);
  $: openIssuesCount = $openIssuesCountStore;

  // Update effective token when component initializes or token changes
  async function updateEffectiveToken() {
    // Get authentication method to determine correct token to use
    const authSettings = await chrome.storage.local.get(['authenticationMethod']);
    const authMethod = authSettings.authenticationMethod || 'pat';

    if (authMethod === 'github_app') {
      // For GitHub App, use a placeholder token that the store will recognize
      effectiveToken = 'github_app_token';
    } else {
      // For PAT, use the actual token
      effectiveToken = token || '';
    }
  }

  // Update effective token when token prop changes
  $: if (token !== undefined) {
    updateEffectiveToken();
  }

  let isLoading = {
    repoStatus: true,
    branchStatus: true,
    visibility: true,
    commits: true,
    latestCommit: true,
    issues: true,
  };

  let repoExists: boolean | null = null;
  let branchExists: boolean | null = null;
  let isPrivate: boolean | null = null;
  let latestCommit: {
    date: string;
    message: string;
  } | null = null;

  export const getProjectStatus = async () => {
    try {
      // Step 1: Try to load from enhanced projectSettings cache first
      const { ChromeStorageService } = await import('../services/chromeStorage');
      const cachedProjectSettings =
        await ChromeStorageService.getProjectSettingsWithMetadata(projectId);

      // Step 2: Try to load from GitHubCacheService
      const { GitHubCacheService } = await import('../services/GitHubCacheService');
      const cachedRepo = await GitHubCacheService.getRepoMetadata(gitHubUsername, repoName);

      // Step 3: Check if we have sufficient cached data
      const hasCachedProjectData =
        cachedProjectSettings && cachedProjectSettings.metadata_last_updated;
      const hasCachedRepoData =
        cachedRepo && !(await GitHubCacheService.isCacheStale(gitHubUsername));

      logger.info(
        `Cache status - Project: ${!!hasCachedProjectData}, Repo: ${!!hasCachedRepoData}`
      );

      // Step 4: Use cached data if available and fresh
      if (hasCachedProjectData && hasCachedRepoData) {
        logger.info('Using cached data for project status');

        // Populate from cached project settings
        if (cachedProjectSettings.is_private !== undefined) {
          isPrivate = cachedProjectSettings.is_private;
          isLoading.visibility = false;
        }

        if (cachedProjectSettings.latest_commit_date) {
          latestCommit = {
            date: cachedProjectSettings.latest_commit_date,
            message:
              cachedProjectSettings.latest_commit_message?.slice(0, 50) +
                (cachedProjectSettings.latest_commit_message &&
                cachedProjectSettings.latest_commit_message.length > 50
                  ? '...'
                  : '') || 'No message',
          };
          isLoading.latestCommit = false;
        }

        // Assume repo exists if we have cached metadata
        repoExists = true;
        isLoading.repoStatus = false;

        // Check branch existence from cached default branch or assume it exists
        branchExists = branch === cachedProjectSettings.default_branch || branch === 'main';
        isLoading.branchStatus = false;

        // Load issues from cache/store
        if (cachedProjectSettings.open_issues_count !== undefined) {
          // Issues count will be updated via store, but we can stop loading
          isLoading.issues = false;
        }

        logger.info('Successfully loaded project status from cache');
        return;
      }

      // Step 5: Cache is stale or missing, fall back to API calls
      logger.info('Cache stale or missing, fetching from GitHub API');

      // Get authentication method to determine how to create the service
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      let githubService: UnifiedGitHubService;

      if (authMethod === 'github_app') {
        // Use GitHub App authentication
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        // Use PAT authentication (backward compatible)
        githubService = new UnifiedGitHubService(token);
      }

      // Get repo info
      const repoInfo = await githubService.getRepoInfo(gitHubUsername, repoName);
      repoExists = repoInfo.exists ?? null;
      isLoading.repoStatus = false;

      if (repoExists) {
        // Get visibility
        isPrivate = repoInfo.private ?? null;
        isLoading.visibility = false;

        // Check if branch exists
        try {
          const branches = await githubService.listBranches(gitHubUsername, repoName);
          branchExists = branches.some((b) => b.name === branch);
          isLoading.branchStatus = false;
        } catch (error) {
          logger.error('Error fetching branches:', error);
          branchExists = false;
          isLoading.branchStatus = false;
        }

        // Get latest commit
        const commits = await githubService.request<GitHubCommit[]>(
          'GET',
          `/repos/${gitHubUsername}/${repoName}/commits?per_page=1`
        );
        let commitCount;
        if (commits[0]?.commit) {
          latestCommit = {
            date: commits[0].commit.committer.date,
            message:
              commits[0].commit.message.split('\n')[0].slice(0, 50) +
              (commits[0].commit.message.length > 50 ? '...' : ''),
          };

          // Get commit count for caching
          try {
            commitCount = await githubService.getCommitCount(gitHubUsername, repoName, branch);
          } catch (err) {
            logger.warn('Could not fetch commit count:', err);
          }
        }
        isLoading.latestCommit = false;

        // Load issues into store - for GitHub App we pass a placeholder token
        const tokenToUse = authMethod === 'github_app' ? 'github_app_token' : token;
        try {
          await issuesStore.loadIssues(gitHubUsername, repoName, tokenToUse, 'all');
        } catch (err) {
          logger.error('Error fetching issues:', err);
        }
        isLoading.issues = false;

        // Step 6: Update cache with fresh data
        try {
          // Create enhanced repo data for cache
          const enhancedRepo = GitHubCacheService.createEnhancedRepo(
            {
              name: repoName,
              private: isPrivate ?? false,
              description: repoInfo.description,
              language: repoInfo.language,
              html_url: `https://github.com/${gitHubUsername}/${repoName}`,
              created_at: repoInfo.created_at,
              updated_at: repoInfo.updated_at,
              default_branch: repoInfo.default_branch || 'main',
              open_issues_count: repoInfo.open_issues_count || 0,
            },
            commitCount,
            latestCommit
              ? {
                  sha: commits[0]?.sha || '',
                  message: commits[0]?.commit?.message || '',
                  date: latestCommit.date,
                  author: commits[0]?.commit?.author?.name || '',
                }
              : undefined
          );

          // Cache the repo metadata
          await GitHubCacheService.cacheRepoMetadata(gitHubUsername, repoName, enhancedRepo);

          // Update project settings with GitHub metadata
          await ChromeStorageService.updateProjectMetadata(projectId, {
            is_private: isPrivate ?? undefined,
            language: repoInfo.language || undefined,
            description: repoInfo.description || undefined,
            commit_count: commitCount,
            latest_commit_date: latestCommit?.date,
            latest_commit_message: latestCommit?.message,
            latest_commit_sha: commits[0]?.sha,
            latest_commit_author: commits[0]?.commit?.author?.name,
            open_issues_count: repoInfo.open_issues_count || 0,
            github_updated_at: repoInfo.updated_at,
            default_branch: repoInfo.default_branch || 'main',
            github_repo_url: `https://github.com/${gitHubUsername}/${repoName}`,
          });

          logger.info('Updated cache and project metadata with fresh GitHub data');
        } catch (cacheError) {
          logger.error('Error updating cache:', cacheError);
          // Don't fail the whole operation if cache update fails
        }
      } else {
        branchExists = false;
        isLoading.branchStatus = false;
        isLoading.visibility = false;
        isLoading.commits = false;
        isLoading.latestCommit = false;
        isLoading.issues = false;
      }
    } catch (error) {
      logger.error('Error fetching repo details:', error);
      // Enhanced error handling for better UX
      if (error instanceof Error && error.message.includes('no github settings')) {
        logger.info('GitHub App not configured - show setup guidance');
      }
      // Reset loading states on error
      Object.keys(isLoading).forEach((key) => (isLoading[key as keyof typeof isLoading] = false));
    }
  };

  // Check if there are stored file changes
  async function checkStoredFileChanges() {
    try {
      const result = await chrome.storage.local.get(['storedFileChanges', 'pendingFileChanges']);
      hasFileChanges = !!(result.storedFileChanges || result.pendingFileChanges);
    } catch (error) {
      logger.error('Error checking for stored file changes:', error);
      hasFileChanges = false;
    }
  }

  // Load project title from storage
  async function loadProjectTitle() {
    try {
      const result = await chrome.storage.sync.get(['projectSettings']);
      const projectSettings = result.projectSettings || {};
      const currentProject = projectSettings[projectId];

      if (currentProject && currentProject.projectTitle) {
        projectTitle = currentProject.projectTitle;
      }
    } catch (error) {
      logger.error('Error loading project title:', error);
    }
  }

  onMount(() => {
    // Check for stored file changes initially
    checkStoredFileChanges();

    // Set up storage change listener
    const storageChangeListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      logger.info(
        'Storage changes detected in ProjectStatus:',
        Object.keys(changes),
        'in area:',
        areaName
      );

      // Check if lastSettingsUpdate changed in local storage
      if (areaName === 'local' && changes.lastSettingsUpdate) {
        const updateInfo = changes.lastSettingsUpdate.newValue;
        logger.info('Settings update detected in ProjectStatus:', updateInfo);

        // Only update if this is the current project
        if (updateInfo.projectId === projectId) {
          logger.info('Updating current project status with:', updateInfo);

          // Update local variables if they've changed
          if (repoName !== updateInfo.repoName) {
            repoName = updateInfo.repoName;
          }
          if (branch !== updateInfo.branch) {
            branch = updateInfo.branch;
          }
          if (updateInfo.projectTitle !== undefined && projectTitle !== updateInfo.projectTitle) {
            projectTitle = updateInfo.projectTitle;
          }

          // Refresh the project status
          getProjectStatus();
        }
      }

      // Update hasFileChanges when storage changes
      if (areaName === 'local' && (changes.storedFileChanges || changes.pendingFileChanges)) {
        checkStoredFileChanges();
      }
    };

    // Add the storage change listener
    chrome.storage.onChanged.addListener(storageChangeListener);

    // Initialize data (async)
    const initializeData = async () => {
      await loadProjectTitle();
      await getProjectStatus();
    };

    // Start initialization
    initializeData();

    // Return a cleanup function to remove the listener when the component is destroyed
    return () => {
      chrome.storage.onChanged.removeListener(storageChangeListener);
    };
  });

  function openGitHub(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    chrome.tabs.create({ url: `https://github.com/${gitHubUsername}/${repoName}/tree/${branch}` });
  }

  function pushToGitHub(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    // Send a message to trigger the GitHub push action
    chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });
  }

  function viewFileChanges(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    // Check if user has premium access
    if (!isUserPremium) {
      handleUpgradeClick('fileChanges');
      return;
    }

    // Instead of sending a message directly, dispatch an event to the parent component
    // This will allow App.svelte to call its showStoredFileChanges function
    dispatch('showFileChanges');
  }

  function checkForChanges(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    // Check if user has premium access
    if (!isUserPremium) {
      handleUpgradeClick('fileChanges');
      return;
    }

    // Use the existing showFileChanges mechanism instead of CHECK_FILE_CHANGES
    dispatch('showFileChanges');
  }

  function openIssueManager(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    // Check if user has premium access
    if (!isUserPremium) {
      handleUpgradeClick('issues');
      return;
    }

    showIssueManager = true;
  }

  function openQuickIssueForm(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();

    // Check if user has premium access
    if (!isUserPremium) {
      handleUpgradeClick('issues');
      return;
    }

    showQuickIssueForm = true;
  }

  function handleIssueSuccess() {
    showQuickIssueForm = false;
    // Issue count will be updated automatically via the store
  }

  function handleIssueManagerClose() {
    showIssueManager = false;
    // Issue count will be updated automatically via the store
  }
</script>

<div class="border border-green-900 bg-green-950 rounded-lg overflow-hidden">
  <div class="text-slate-300">
    <div class="space-y-3 px-4 py-4">
      <!-- Project details section -->
      <div
        class="grid grid-cols-[4.5rem_1fr] gap-x-2 bg-slate-900/50 p-3 rounded-sm cursor-pointer hover:bg-slate-900/70 transition-colors group"
        on:click={() => (showSettingsModal = true)}
        on:keydown={(e) => e.key === 'Enter' && (showSettingsModal = true)}
        role="button"
        tabindex={0}
      >
        <span class="text-slate-400">Project:</span>
        <span class="font-mono">{projectTitle}</span>
        <span class="text-slate-400">ID:</span>
        <span class="font-mono">{projectId}</span>
        <span class="text-slate-400">Repository:</span>
        <span class="font-mono">{repoName}</span>
        <span class="text-slate-400">Branch:</span>
        <span class="font-mono">{branch}</span>
        <span class="text-slate-400">Status:</span>
        <span class="font-mono">
          {#if isLoading.repoStatus || isLoading.branchStatus}
            <span class="text-slate-500">Loading...</span>
          {:else if repoExists && branchExists}
            <span class="text-green-400">Repo/branch exists</span>
          {:else if repoExists && !branchExists}
            <span class="text-yellow-400">Repo exists, branch to be created</span>
          {:else}
            <span class="text-blue-400">Will be created</span>
          {/if}
        </span>
        <span class="text-slate-400">Visibility:</span>
        <span class="font-mono">
          {#if isLoading.visibility}
            <span class="text-slate-500">Loading...</span>
          {:else}
            {repoExists ? (isPrivate ? 'Private' : 'Public') : 'N/A'}
          {/if}
        </span>
        <span class="text-slate-400">Open Issues:</span>
        <span class="font-mono">
          {#if isLoading.issues}
            <span class="text-slate-500">Loading...</span>
          {:else}
            <span class="text-slate-300">{openIssuesCount}</span>
          {/if}
        </span>
        <span class="text-slate-400">Latest Commit:</span>
        <span class="font-mono">
          {#if isLoading.latestCommit}
            <span class="text-slate-500">Loading...</span>
          {:else if latestCommit}
            <div class="text-xs text-slate-400 mt-1">
              {new Date(latestCommit.date).toLocaleString()}
            </div>
            <div class="text-xs text-slate-400 mt-1">{latestCommit.message}</div>
          {:else}
            N/A
          {/if}
        </span>
      </div>

      <!-- Icon-only buttons with tooltips -->
      <div class="flex justify-center gap-2">
        <!-- Open in GitHub button -->
        <button
          class="tooltip-container w-8 h-8 flex items-center justify-center border border-slate-700 rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
          on:click|stopPropagation={openGitHub}
          disabled={isLoading.repoStatus || !repoExists}
          aria-label="Open in GitHub"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
            ></path>
          </svg>
          <span class="tooltip">Open in GitHub</span>
        </button>

        <!-- GitHub Issues Manager button (PRO) -->
        <div class="relative">
          <button
            class="tooltip-container w-8 h-8 flex items-center justify-center border border-slate-700 rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors {!isUserPremium
              ? 'opacity-75'
              : ''}"
            on:click|stopPropagation={openIssueManager}
            disabled={isLoading.repoStatus || !repoExists}
            aria-label="GitHub Issues{!isUserPremium ? ' (Pro)' : ''}"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            <span class="tooltip">GitHub Issues{!isUserPremium ? ' (Pro)' : ''}</span>
          </button>
          {#if !isUserPremium}
            <span
              class="absolute -top-1 -right-1 text-[8px] bg-gradient-to-r from-blue-500 to-purple-600 text-white px-1 py-0.5 rounded-full font-bold leading-none"
              >PRO</span
            >
          {/if}
        </div>

        <!-- Quick Issue button -->
        <div class="relative">
          <button
            class="tooltip-container w-8 h-8 flex items-center justify-center border border-slate-700 rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
            on:click|stopPropagation={openQuickIssueForm}
            disabled={isLoading.repoStatus || !repoExists}
            aria-label="Quick Issue"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="tooltip">Quick Issue{!isUserPremium ? ' (Pro)' : ''}</span>
          </button>
          {#if !isUserPremium}
            <span
              class="absolute -top-1 -right-1 text-[8px] bg-gradient-to-r from-blue-500 to-purple-600 text-white px-1 py-0.5 rounded-full font-bold leading-none"
              >PRO</span
            >
          {/if}
        </div>

        <!-- File Changes buttons -->
        {#if hasFileChanges}
          <!-- View File Changes button - show when there are changes -->
          <div class="relative">
            <button
              class="tooltip-container w-8 h-8 flex items-center justify-center border border-slate-700 rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors {!isUserPremium
                ? 'opacity-75'
                : ''}"
              on:click|stopPropagation={viewFileChanges}
              aria-label="View File Changes{!isUserPremium ? ' (Pro)' : ''}"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <span class="tooltip">View File Changes{!isUserPremium ? ' (Pro)' : ''}</span>
            </button>
            {#if !isUserPremium}
              <span
                class="absolute -top-1 -right-1 text-[8px] bg-gradient-to-r from-blue-500 to-purple-600 text-white px-1 py-0.5 rounded-full font-bold leading-none"
                >PRO</span
              >
            {/if}
          </div>
        {:else}
          <!-- Check for Changes button - show when no changes are detected -->
          <div class="relative">
            <button
              class="tooltip-container w-8 h-8 flex items-center justify-center border border-slate-700 rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors {!isUserPremium
                ? 'opacity-75'
                : ''}"
              on:click|stopPropagation={checkForChanges}
              aria-label="Check for Changes{!isUserPremium ? ' (Pro)' : ''}"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2z"></path>
                <path d="M16 12c0-5-3-9-7-9s-7 4-7 9c0 5 3 9 7 9 1.5 0 3-.5 4-1"></path>
              </svg>
              <span class="tooltip">Check for Changes{!isUserPremium ? ' (Pro)' : ''}</span>
            </button>
            {#if !isUserPremium}
              <span
                class="absolute -top-1 -right-1 text-[8px] bg-gradient-to-r from-blue-500 to-purple-600 text-white px-1 py-0.5 rounded-full font-bold leading-none"
                >PRO</span
              >
            {/if}
          </div>
        {/if}

        <!-- Push to GitHub button -->
        <button
          class="tooltip-container w-8 h-8 flex items-center justify-center border border-green-700 bg-green-900/30 rounded-full text-green-400 hover:bg-green-800/50 hover:text-green-300 transition-colors"
          on:click|stopPropagation={pushToGitHub}
          disabled={isLoading.repoStatus}
          aria-label="Push to GitHub"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span class="tooltip">Push to GitHub</span>
        </button>
      </div>
    </div>
  </div>
</div>

{#if showSettingsModal}
  <RepoSettings
    show={showSettingsModal}
    repoOwner={gitHubUsername}
    githubToken={token}
    {projectId}
    {repoName}
    {branch}
    {projectTitle}
    on:close={() => {
      showSettingsModal = false;
      // Refresh project status after saving
      getProjectStatus();
      // Notify parent that settings were updated
      dispatch('settingsUpdated');
    }}
  />
{/if}

{#if showIssueManager}
  <IssueManager
    show={showIssueManager}
    githubToken={effectiveToken}
    repoOwner={gitHubUsername}
    {repoName}
    on:close={handleIssueManagerClose}
  />
{/if}

{#if showQuickIssueForm}
  <QuickIssueForm
    show={showQuickIssueForm}
    githubToken={effectiveToken}
    repoOwner={gitHubUsername}
    {repoName}
    on:success={handleIssueSuccess}
    on:close={() => (showQuickIssueForm = false)}
  />
{/if}

<style>
  /* Tooltip styles */
  .tooltip-container {
    position: relative;
  }

  .tooltip {
    visibility: hidden;
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #1a1a1a;
    color: #f0f0f0;
    text-align: center;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    white-space: nowrap;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    opacity: 0;
    transition:
      opacity 0.2s,
      visibility 0.2s;
  }

  .tooltip::before {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 5px 5px 0 5px;
    border-style: solid;
    border-color: #1a1a1a transparent transparent transparent;
  }

  .tooltip-container:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
</style>
