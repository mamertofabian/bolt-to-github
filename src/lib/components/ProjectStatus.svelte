<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
  import RepoSettings from '$lib/components/RepoSettings.svelte';
  import IssueManager from '$lib/components/IssueManager.svelte';
  import QuickIssueForm from '$lib/components/QuickIssueForm.svelte';
  import { isPremium } from '$lib/stores/premiumStore';
  import { issuesStore } from '$lib/stores/issuesStore';
  import type { UpgradeModalType } from '$lib/utils/upgradeModal';

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

  // Premium status
  $: isUserPremium = $isPremium;

  // Issues count from store
  $: openIssuesCountStore = issuesStore.getOpenIssuesCount(gitHubUsername, repoName);
  $: openIssuesCount = $openIssuesCountStore;

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
      repoExists = repoInfo.exists;
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
          console.log('Error fetching branches:', error);
          branchExists = false;
          isLoading.branchStatus = false;
        }

        // Get latest commit
        const commits = await githubService.request(
          'GET',
          `/repos/${gitHubUsername}/${repoName}/commits?per_page=1`
        );
        if (commits[0]?.commit) {
          latestCommit = {
            date: commits[0].commit.committer.date,
            message:
              commits[0].commit.message.split('\n')[0].slice(0, 50) +
              (commits[0].commit.message.length > 50 ? '...' : ''),
          };
        }
        isLoading.latestCommit = false;

        // Load issues into store - for GitHub App we pass a placeholder token
        const tokenToUse = authMethod === 'github_app' ? 'github_app_token' : token;
        try {
          await issuesStore.loadIssues(gitHubUsername, repoName, tokenToUse, 'all');
        } catch (err) {
          console.log('Error fetching issues:', err);
        }
        isLoading.issues = false;
      } else {
        branchExists = false;
        isLoading.branchStatus = false;
        isLoading.visibility = false;
        isLoading.commits = false;
        isLoading.latestCommit = false;
        isLoading.issues = false;
      }
    } catch (error) {
      console.log('Error fetching repo details:', error);
      // Enhanced error handling for better UX
      if (error instanceof Error && error.message.includes('no github settings')) {
        console.log('GitHub App not configured - show setup guidance');
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
      console.error('Error checking for stored file changes:', error);
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
      console.error('Error loading project title:', error);
    }
  }

  onMount(() => {
    // Check for stored file changes initially
    checkStoredFileChanges();

    // Set up storage change listener
    const storageChangeListener = (changes: any, areaName: string) => {
      console.log('Storage changes detected in ProjectStatus:', changes, 'in area:', areaName);

      // Check if lastSettingsUpdate changed in local storage
      if (areaName === 'local' && changes.lastSettingsUpdate) {
        const updateInfo = changes.lastSettingsUpdate.newValue;
        console.log('Settings update detected in ProjectStatus:', updateInfo);

        // Only update if this is the current project
        if (updateInfo.projectId === projectId) {
          console.log('Updating current project status with:', updateInfo);

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

  const dispatch = createEventDispatcher();

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

        <!-- View File Changes button - only show if there are changes -->
        {#if hasFileChanges}
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
    githubToken={token}
    repoOwner={gitHubUsername}
    {repoName}
    on:close={handleIssueManagerClose}
  />
{/if}

{#if showQuickIssueForm}
  <QuickIssueForm
    show={showQuickIssueForm}
    githubToken={token}
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
