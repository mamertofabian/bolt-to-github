<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    Github,
    Import,
    Zap,
    X,
    RefreshCw,
    Trash2,
    Settings,
    ChevronLeft,
    ChevronRight,
    Loader2,
  } from 'lucide-svelte';
  import RepoSettings from '$lib/components/RepoSettings.svelte';
  import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
  import { GitHubApiClientFactory } from '../../services/GitHubApiClientFactory';
  import type { IGitHubApiClient } from '../../services/interfaces/IGitHubApiClient';
  import BranchSelectionModal from '../../popup/components/BranchSelectionModal.svelte';
  import {
    githubSettingsStore,
    githubSettingsActions,
    repositoryActions,
    repositoryStore,
  } from '$lib/stores';

  export let isBoltSite: boolean = true;
  export let currentlyLoadedProjectId: string | null = null;

  // Store-based authentication instead of props
  $: githubSettings = $githubSettingsStore;
  $: hasGitHubApp = githubSettings.githubAppStatus.hasInstallationToken;
  $: hasPAT = Boolean(githubSettings.githubToken);
  $: hasAuthentication = hasGitHubApp || hasPAT;
  $: authMethod = githubSettings.authMethod; // 'github_app' | 'pat' | 'unknown'
  $: repoOwner = githubSettings.repoOwner;
  $: githubToken = githubSettings.githubToken; // Still available for legacy operations

  // Use stores instead of props
  $: projectSettings = $githubSettingsStore.projectSettings;

  // GitHub API Client
  let githubApiClient: IGitHubApiClient | null = null;
  let clientInitializationError = '';

  // Pagination state
  let boltProjectsPage = 1;
  let reposPage = 1;
  const itemsPerPage = 5;
  let paginatedBoltProjects: any[] = [];
  let paginatedRepos: any[] = [];
  let boltProjectsTotalPages = 0;
  let reposTotalPages = 0;
  let totalBoltProjects = 0;
  let totalRepos = 0;

  let loadingRepos = false;
  let initialLoadingRepos = true;
  let showDeleteModal = false;
  let projectToDelete: { projectId: string; repoName: string } | null = null;
  let showSettingsModal = false;
  let projectToEdit: {
    projectId: string;
    repoName: string;
    branch: string;
    projectTitle?: string;
  } | null = null;
  let showBranchSelectionModal = false;
  let repoToImport: { owner: string; repo: string; isPrivate: boolean } | null = null;

  // Add confirmation dialog state
  let showImportConfirmDialog = false;
  let repoToConfirmImport: { owner: string; repo: string; isPrivate: boolean } | null = null;

  let commitCounts: Record<string, number> = {};
  let loadingCommitCounts: Record<string, boolean> = {};
  let allRepos: Array<{
    name: string;
    description: string | null;
    private: boolean;
    html_url: string;
    created_at: string;
    updated_at: string;
    language: string | null;
  }> = [];

  let searchQuery = '';
  let showRepos = true;
  let importProgress: { repoName: string; status: string; progress?: number } | null = null;
  let currentTabIsBolt = false;

  // Cache keys and durations
  const REPOS_CACHE_KEY = `github_repos_${repoOwner}`;
  const REPOS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Initialize GitHub API Client
  async function initializeGitHubClient() {
    if (!hasAuthentication) {
      clientInitializationError = 'No GitHub authentication available';
      return;
    }

    clientInitializationError = '';

    try {
      if (hasGitHubApp) {
        // Preferred: Use GitHub App
        githubApiClient = await GitHubApiClientFactory.createApiClientForNewUser();
        console.log('GitHub client initialized using GitHub App');
      } else if (hasPAT) {
        // Fallback: Use PAT
        githubApiClient = await GitHubApiClientFactory.createApiClientForExistingUser(
          githubSettings.githubToken,
          true // Allow migrate to GitHub App if available
        );
        console.log('GitHub client initialized using PAT');
      }
    } catch (err: any) {
      clientInitializationError = err.message;
      console.error('Error initializing GitHub client:', err);
    }
  }

  // Reset pagination when search changes
  $: if (searchQuery !== undefined) {
    boltProjectsPage = 1;
    reposPage = 1;
  }

  // Watch for authentication changes
  $: if (authMethod && authMethod !== 'unknown') {
    initializeGitHubClient();
  }

  // Filter and paginate logic
  $: {
    const existingProjects = Object.entries(projectSettings).map(([projectId, settings]) => ({
      projectId,
      repoName: settings.repoName,
      branch: settings.branch,
      projectTitle: settings.projectTitle || '',
      gitHubRepo: false,
    }));

    const repos = showRepos
      ? allRepos.map((repo) => ({
          repoName: repo.name,
          gitHubRepo: true,
          private: repo.private,
          description: repo.description,
          language: repo.language,
        }))
      : [];

    // First filter by search across all items
    const allProjects = [...existingProjects, ...repos];
    const searchFiltered = allProjects.filter(
      (project) =>
        project.repoName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ('projectTitle' in project &&
          project.projectTitle &&
          project.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Separate into bolt projects and repos
    const boltProjects = searchFiltered.filter((p) => !p.gitHubRepo);
    const gitHubRepos = searchFiltered.filter((p) => p.gitHubRepo);

    // Store totals for display
    totalBoltProjects = boltProjects.length;
    totalRepos = gitHubRepos.length;

    // Calculate total pages
    boltProjectsTotalPages = Math.ceil(boltProjects.length / itemsPerPage);
    reposTotalPages = Math.ceil(gitHubRepos.length / itemsPerPage);

    // Ensure current pages don't exceed total pages
    if (boltProjectsPage > boltProjectsTotalPages && boltProjectsTotalPages > 0) {
      boltProjectsPage = boltProjectsTotalPages;
    }
    if (reposPage > reposTotalPages && reposTotalPages > 0) {
      reposPage = reposTotalPages;
    }

    // Apply pagination
    const boltStartIndex = (boltProjectsPage - 1) * itemsPerPage;
    const reposStartIndex = (reposPage - 1) * itemsPerPage;

    paginatedBoltProjects = boltProjects.slice(boltStartIndex, boltStartIndex + itemsPerPage);
    paginatedRepos = gitHubRepos.slice(reposStartIndex, reposStartIndex + itemsPerPage);
  }

  async function loadReposFromCache() {
    try {
      const cached = await chrome.storage.local.get([
        REPOS_CACHE_KEY,
        `${REPOS_CACHE_KEY}_timestamp`,
      ]);
      const cachedRepos = cached[REPOS_CACHE_KEY];
      const timestamp = cached[`${REPOS_CACHE_KEY}_timestamp`];

      if (cachedRepos && timestamp && Date.now() - timestamp < REPOS_CACHE_DURATION) {
        console.log('Loading repos from cache for', repoOwner);
        allRepos = cachedRepos;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load repos from cache:', error);
      return false;
    }
  }

  async function saveReposToCache(repos: typeof allRepos) {
    try {
      await chrome.storage.local.set({
        [REPOS_CACHE_KEY]: repos,
        [`${REPOS_CACHE_KEY}_timestamp`]: Date.now(),
      });
      console.log('Repos cached for', repoOwner);
    } catch (error) {
      console.error('Failed to cache repos:', error);
    }
  }

  async function loadAllRepos(forceRefresh = false) {
    console.log('Loading repos for', repoOwner, forceRefresh ? '(force refresh)' : '');

    try {
      loadingRepos = true;

      // Try to load from cache first unless force refresh is requested
      if (!forceRefresh) {
        const cachedSuccessfully = await loadReposFromCache();
        if (cachedSuccessfully) {
          initialLoadingRepos = false;
          loadingRepos = false;
          return;
        }
      }

      // Ensure GitHub client is initialized
      if (!githubApiClient) {
        await initializeGitHubClient();
      }

      if (!githubApiClient) {
        throw new Error(clientInitializationError || 'GitHub client not available');
      }

      // Fetch from API using convenience methods
      let repos;
      try {
        if (hasGitHubApp) {
          // GitHub App: Use installation repositories endpoint
          const response = await githubApiClient.getInstallationRepositories();
          repos = response.repositories;
        } else {
          // PAT: Use user repositories endpoint
          repos = await githubApiClient.getUserRepositories({ sort: 'updated', per_page: 100 });
        }
      } catch (error: any) {
        if (
          error.status === 404 ||
          error.status === 403 ||
          error.message?.includes('404') ||
          error.message?.includes('403')
        ) {
          throw new Error('Access denied or repositories not found. Check GitHub authentication.');
        }
        throw error;
      }

      // Simulate a brief delay for better UX (only for non-cached loads)
      if (initialLoadingRepos) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      allRepos = repos;
      await saveReposToCache(repos);

      initialLoadingRepos = false;
      loadingRepos = false;
    } catch (error: any) {
      initialLoadingRepos = false;
      loadingRepos = false;
      console.error('Failed to load repos:', error);

      // Show user-friendly error message for common issues
      if (error.status === 401 || error.message?.includes('401')) {
        clientInitializationError = 'GitHub authentication expired. Please reconnect.';
      } else if (error.status === 403 || error.message?.includes('403')) {
        clientInitializationError = 'GitHub access forbidden. Check permissions.';
      } else {
        clientInitializationError = error.message || 'Failed to load repositories';
      }
    }
  }

  // Updated function to refresh project data using repository store
  async function refreshProjectData(forceRefresh = false) {
    console.log('Refreshing project data in ProjectsList', forceRefresh ? '(force refresh)' : '');

    if (!hasAuthentication || !repoOwner) {
      console.warn('Cannot refresh project data: No authentication or owner not available');
      return;
    }

    // Track which projects need loading
    const projectsToLoad = Object.entries(projectSettings);

    // Set loading states for projects we're about to fetch
    const newLoadingStates: Record<string, boolean> = { ...loadingCommitCounts };
    for (const [projectId] of projectsToLoad) {
      newLoadingStates[projectId] = true;
    }
    loadingCommitCounts = newLoadingStates;

    // Use repository store to get repository information
    for (const [projectId, settings] of projectsToLoad) {
      try {
        // Get repository information from store (with caching) - only use token if available
        if (githubToken) {
          await repositoryActions.getRepositoryInfo(
            repoOwner,
            settings.repoName,
            githubToken,
            forceRefresh
          );
        }

        // Ensure GitHub client is initialized for commit count
        if (!githubApiClient) {
          await initializeGitHubClient();
        }

        if (githubApiClient) {
          try {
            // Get commit count using convenience method
            const allCommits = await githubApiClient.getRepositoryCommits(
              repoOwner,
              settings.repoName,
              { sha: settings.branch, per_page: 100 }
            );
            commitCounts[projectId] = Array.isArray(allCommits) ? allCommits.length : 0;
          } catch (error: any) {
            console.error(`Failed to fetch commit count for ${projectId}:`, error);
            // Keep existing count if available
            if (commitCounts[projectId] === undefined) {
              commitCounts[projectId] = 0;
            }
          }
        }
      } catch (error: any) {
        console.error(`Failed to fetch repository info for ${projectId}:`, error);
        // Keep existing count if available
        if (commitCounts[projectId] === undefined) {
          commitCounts[projectId] = 0;
        }
      } finally {
        // Clear loading state for this project
        newLoadingStates[projectId] = false;
      }
    }

    // Update loading states
    loadingCommitCounts = newLoadingStates;
  }

  onMount(async () => {
    // Initialize GitHub settings and repository store
    await githubSettingsActions.initialize();
    await repositoryActions.initialize();

    // Initialize data (async)
    const initializeData = async () => {
      // Get current tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTabIsBolt = tab?.url?.includes('bolt.new') ?? false;

      // Auto-initialize client if authentication is available
      if (hasAuthentication) {
        await initializeGitHubClient();
      }

      // Load all repos (will try cache first)
      await loadAllRepos();

      // Initial load of project data using repository store
      await refreshProjectData();
    };

    // Start initialization
    initializeData();
  });

  // Keep track of previous project settings to detect changes
  let previousProjectSettings: typeof projectSettings = {};

  // Watch for changes in projectSettings from the store and refresh data
  $: if (projectSettings && Object.keys(projectSettings).length > 0) {
    // Check if this is a new project or branch change
    const currentKeys = Object.keys(projectSettings);
    const previousKeys = Object.keys(previousProjectSettings);

    const hasNewProjects = currentKeys.some((key) => !previousKeys.includes(key));
    const hasBranchChanges = currentKeys.some(
      (key) =>
        previousProjectSettings[key] &&
        projectSettings[key] &&
        previousProjectSettings[key].branch !== projectSettings[key].branch
    );

    if (hasNewProjects || hasBranchChanges) {
      // Force refresh project data for new projects or branch changes
      refreshProjectData(true);
    } else if (currentKeys.length !== previousKeys.length) {
      // Just refresh normally for other changes
      refreshProjectData();
    }

    // Update previous settings
    previousProjectSettings = { ...projectSettings };
  }

  // Helper function to render project actions
  function renderProjectActions(project: any) {
    return [
      ...(project.projectId && project.projectId !== currentlyLoadedProjectId
        ? [
            {
              icon: Zap,
              title: 'Open in Bolt',
              class: 'hover:text-emerald-500',
              action: () => openBoltProject(project.projectId),
            },
          ]
        : []),
      {
        icon: Github,
        title: 'Open GitHub Repository',
        class: 'hover:text-blue-500',
        action: () => openGitHubRepo(repoOwner, project.repoName),
      },
      ...(!project.projectId
        ? [
            {
              icon: Import,
              title: 'Import from GitHub to Bolt',
              class: 'hover:text-amber-500',
              action: () => importFromGitHub(repoOwner, project.repoName, project.private ?? false),
            },
          ]
        : []),
      ...(project.projectId
        ? [
            {
              icon: Settings,
              title: 'Repository Settings',
              class: 'hover:text-amber-500',
              action: () =>
                openRepoSettings(
                  project.projectId,
                  project.repoName,
                  project.branch || 'main',
                  project.projectTitle || project.repoName
                ),
            },
            {
              icon: Trash2,
              title: 'Delete Project',
              class: 'hover:text-red-500',
              action: () => confirmDeleteProject(project.projectId, project.repoName),
            },
          ]
        : []),
    ];
  }

  function openBoltProject(projectId: string) {
    window.open(`https://bolt.new/~/${projectId}`, '_blank');
  }

  function openGitHubRepo(repoOwner: string, repoName: string) {
    window.open(`https://github.com/${repoOwner}/${repoName}`, '_blank');
  }

  function confirmDeleteProject(projectId: string, repoName: string) {
    projectToDelete = { projectId, repoName };
    showDeleteModal = true;
  }

  function openRepoSettings(
    projectId: string,
    repoName: string,
    branch: string,
    projectTitle: string = ''
  ) {
    projectToEdit = { projectId, repoName, branch, projectTitle };
    showSettingsModal = true;
  }

  async function deleteProject() {
    try {
      if (projectToDelete) {
        // Get current settings
        const settings = await chrome.storage.sync.get(['projectSettings']);
        let updatedProjectSettings = { ...(settings.projectSettings || {}) };

        // Delete single project
        delete updatedProjectSettings[projectToDelete.projectId];

        // Save updated settings to Chrome storage
        await chrome.storage.sync.set({ projectSettings: updatedProjectSettings });

        // Update the store to trigger reactivity
        githubSettingsStore.update((state) => ({
          ...state,
          projectSettings: updatedProjectSettings,
        }));

        // Remove from commit counts
        if (projectToDelete.projectId in commitCounts) {
          delete commitCounts[projectToDelete.projectId];
          commitCounts = { ...commitCounts };
        }
        if (projectToDelete.projectId in loadingCommitCounts) {
          delete loadingCommitCounts[projectToDelete.projectId];
          loadingCommitCounts = { ...loadingCommitCounts };
        }

        // Clear repository cache for this project
        const projectSettings = await chrome.storage.sync.get(['projectSettings']);
        const settings_data = projectSettings.projectSettings || {};
        const projectData = settings_data[projectToDelete.projectId];
        if (projectData && repoOwner) {
          await repositoryActions.clearRepositoryCache(repoOwner, projectData.repoName);
        }
      }

      // Close the modal and reset state
      showDeleteModal = false;
      projectToDelete = null;
    } catch (error: any) {
      console.error('Failed to delete project(s):', error);
      const errorMessage = error.message || 'Unknown error occurred';
      alert(`Failed to delete project: ${errorMessage}`);
    }
  }

  async function importFromGitHub(repoOwner: string, repoName: string, isPrivate: boolean) {
    if (!isPrivate) {
      window.open(`https://bolt.new/~/github.com/${repoOwner}/${repoName}`, '_blank');
      return;
    }

    // Store the repo info and show confirmation dialog
    repoToConfirmImport = { owner: repoOwner, repo: repoName, isPrivate };
    showImportConfirmDialog = true;
  }

  async function handleImportConfirm() {
    if (!repoToConfirmImport) return;

    // Show branch selection modal
    repoToImport = {
      owner: repoToConfirmImport.owner,
      repo: repoToConfirmImport.repo,
      isPrivate: repoToConfirmImport.isPrivate,
    };
    showBranchSelectionModal = true;

    // Reset confirmation state
    showImportConfirmDialog = false;
    repoToConfirmImport = null;
  }

  function handleImportCancel() {
    showImportConfirmDialog = false;
    repoToConfirmImport = null;
  }

  async function handleBranchSelected(branch: string) {
    if (!repoToImport) return;

    const { owner, repo } = repoToImport;
    showBranchSelectionModal = false;

    try {
      console.log(`🔄 Sending message to import private repo: ${repo} from branch: ${branch}`);

      // Only show progress if we're not on bolt.new
      if (!currentTabIsBolt) {
        importProgress = { repoName: repo, status: `Starting import from branch '${branch}'...` };
      }

      // Send message directly to background service
      const port = chrome.runtime.connect({ name: 'popup' });

      // Set up listener first
      port.onMessage.addListener((message) => {
        if (message.type === 'UPLOAD_STATUS') {
          console.log('📥 Import status update:', message.status);
        }
      });

      port.onMessage.addListener((message) => {
        if (message.type === 'UPLOAD_STATUS') {
          console.log('📥 Import status update:', message.status);

          if (!currentTabIsBolt) {
            importProgress = {
              repoName: repo,
              status: message.status.message || 'Processing...',
              progress: message.status.progress,
            };
            // If the import is complete or failed, clear the progress after a delay
            if (message.status.status === 'success' || message.status.status === 'error') {
              setTimeout(() => {
                importProgress = null;
                window.close();
              }, 1500);
            }
          } else if (message.status.status === 'success') {
            // If we're on bolt.new, just close the popup when done
            window.close();
          }
        }
      });

      // Then send message with branch information
      port.postMessage({
        type: 'IMPORT_PRIVATE_REPO',
        data: { repoName: repo, branch },
      });

      // If we're on bolt.new, close the popup immediately
      if (currentTabIsBolt) {
        window.close();
      }
    } catch (error: any) {
      console.error('❌ Failed to import private repository:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      alert(`Failed to import private repository: ${errorMessage}. Please try again later.`);
      repoToImport = null;
    }
  }

  // Pagination functions
  function goToBoltPage(page: number) {
    if (page >= 1 && page <= boltProjectsTotalPages) {
      boltProjectsPage = page;
    }
  }

  function goToRepoPage(page: number) {
    if (page >= 1 && page <= reposTotalPages) {
      reposPage = page;
    }
  }

  // Handle refresh with force refresh
  async function handleRefreshRepos() {
    await loadAllRepos(true);
    // Also refresh project data when refreshing repos
    await refreshProjectData(true);
  }

  // Helper function to show migrate prompt for PAT users
  async function connectToGitHubApp() {
    // Redirect to GitHub App installation/authorization
    const connectUrl = 'https://bolt2github.com/dashboard?tab=github&action=connect';
    await chrome.tabs.create({ url: connectUrl });
  }
</script>

<div class="space-y-2">
  <!-- Authentication Status -->
  {#if hasGitHubApp}
    <div
      class="flex items-center gap-2 mb-3 px-3 py-2 bg-emerald-900/20 border border-emerald-800 rounded-lg"
    >
      <div class="text-emerald-400 text-sm">✅ Using GitHub App (Recommended)</div>
    </div>
  {:else if hasPAT}
    <div
      class="flex items-center justify-between gap-2 mb-3 px-3 py-2 bg-amber-900/20 border border-amber-800 rounded-lg"
    >
      <div class="text-amber-400 text-sm">⚠️ Using Personal Access Token</div>
      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-amber-400 hover:text-amber-300"
        on:click={connectToGitHubApp}
      >
        Connect to GitHub App
      </Button>
    </div>
  {:else}
    <div
      class="flex items-center justify-between gap-2 mb-3 px-3 py-2 bg-red-900/20 border border-red-800 rounded-lg"
    >
      <div class="text-red-400 text-sm">❌ No GitHub authentication</div>
      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-red-400 hover:text-red-300"
        on:click={connectToGitHubApp}
      >
        Connect to GitHub App
      </Button>
    </div>
  {/if}

  {#if clientInitializationError}
    <div
      class="flex items-center gap-2 mb-3 px-3 py-2 bg-red-900/20 border border-red-800 rounded-lg"
    >
      <div class="text-red-400 text-sm">
        ⚠️ GitHub Client Error: {clientInitializationError}
      </div>
    </div>
  {/if}

  <div class="flex items-center gap-2 mb-4">
    <div class="flex-1 relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search projects..."
        class="w-full bg-transparent border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-700 transition-colors"
      />
      {#if searchQuery}
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
          on:click={() => (searchQuery = '')}
        >
          <X class="h-4 w-4" />
        </Button>
      {/if}
    </div>
    <label class="flex items-center gap-2 text-sm text-slate-400">
      <input
        type="checkbox"
        bind:checked={showRepos}
        class="w-4 h-4 rounded border-slate-800 bg-transparent"
      />
      Show Repos
    </label>
    {#if showRepos}
      <Button
        variant="ghost"
        class="border-slate-800 hover:bg-slate-800 text-slate-200 transition-colors"
        title="Refresh Repos"
        disabled={loadingRepos || !hasAuthentication}
        on:click={handleRefreshRepos}
      >
        {#if loadingRepos}
          <RefreshCw class="animate-spin h-5 w-5" />
        {:else}
          <RefreshCw class="h-5 w-5" />
        {/if}
      </Button>
    {/if}
  </div>

  {#if totalBoltProjects === 0 && totalRepos === 0 && !initialLoadingRepos && !loadingRepos}
    <div
      class="flex flex-col items-center justify-center p-6 text-center space-y-6 bg-slate-900/30 rounded-lg border border-slate-800"
    >
      <div class="space-y-3">
        {#if !isBoltSite}
          <Button
            variant="outline"
            class="border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors"
            on:click={() => window.open('https://bolt.new', '_blank')}
          >
            Go to bolt.new
          </Button>
        {/if}
        <p class="text-sm text-emerald-400">
          💡 No Bolt projects found. Create or load an existing Bolt project to get started.
        </p>
        <p class="text-sm text-blue-400">🌟 You can also load any of your GitHub repositories.</p>
      </div>
    </div>
  {:else}
    <!-- Bolt Projects Section -->
    {#if totalBoltProjects > 0}
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3 px-1">
          <h2 class="text-sm font-semibold text-emerald-500 flex items-center gap-2">
            <Zap class="h-4 w-4" /> Bolt Projects
            <span class="text-xs text-slate-400 font-normal">({totalBoltProjects})</span>
          </h2>
          {#if boltProjectsTotalPages > 1}
            <div class="flex items-center gap-1 text-xs text-slate-400">
              Page {boltProjectsPage} of {boltProjectsTotalPages}
            </div>
          {/if}
        </div>

        {#each paginatedBoltProjects as project}
          <div
            class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-all duration-200 relative mb-2 group {project.projectId ===
            currentlyLoadedProjectId
              ? 'bg-slate-800/30 border-slate-700 shadow-lg shadow-emerald-500/10'
              : ''}"
            role="button"
            tabindex="-1"
            aria-label="Bolt project {project.repoName}"
          >
            <div class="flex flex-col">
              <div class="relative">
                <div class="w-full">
                  <h3 class="font-medium">
                    {#if 'projectTitle' in project && project.projectTitle}
                      <span class="text-emerald-400">{project.projectTitle}</span>
                      <span class="text-slate-400 text-sm mx-2">•</span>
                    {/if}
                    {project.repoName}
                    {project.branch ? `(${project.branch})` : ''}
                    {#if project.projectId === currentlyLoadedProjectId}
                      <span class="text-xs text-emerald-500 ml-2 font-semibold">(Current)</span>
                    {/if}
                    {#if project.gitHubRepo}
                      <span
                        class="text-xs {project.private ? 'text-red-400' : 'text-blue-400'} ml-2"
                      >
                        ({project.private ? 'Private' : 'Public'})
                      </span>
                    {/if}
                  </h3>
                  <div class="flex flex-col gap-1 text-xs text-slate-400 mt-1">
                    {#if project.projectId}
                      <p>
                        Bolt ID: {project.projectId} (
                        {#if loadingCommitCounts[project.projectId]}
                          <span class="inline-flex items-center">
                            <div class="commit-loader"></div>
                          </span>
                        {:else}
                          {commitCounts[project.projectId] ?? '...'}
                        {/if} commits)
                      </p>
                    {/if}
                    {#if project.description}
                      <p class="text-slate-300">{project.description}</p>
                    {/if}
                    {#if project.language}
                      <p>Language: <span class="text-slate-300">{project.language}</span></p>
                    {/if}
                  </div>
                </div>

                <div
                  class="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-l from-slate-800/95 via-slate-800/80 to-transparent pl-8 pr-1 py-1 rounded-l-full"
                >
                  {#each renderProjectActions(project) as action}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={action.title}
                      class="h-8 w-8 {action.class} transition-colors"
                      on:click={action.action}
                    >
                      <svelte:component this={action.icon} class="h-5 w-5" />
                    </Button>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/each}

        <!-- Bolt Projects Pagination -->
        {#if boltProjectsTotalPages > 1}
          <div class="flex items-center justify-center gap-2 mt-4 mb-2">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 border border-slate-800 hover:bg-slate-800 transition-colors"
              disabled={boltProjectsPage === 1}
              on:click={() => goToBoltPage(boltProjectsPage - 1)}
            >
              <ChevronLeft class="h-4 w-4" />
            </Button>

            {#each Array.from({ length: Math.min(5, boltProjectsTotalPages) }, (_, i) => {
              const startPage = Math.max(1, Math.min(boltProjectsPage - 2, boltProjectsTotalPages - 4));
              return startPage + i;
            }) as page}
              {#if page <= boltProjectsTotalPages}
                <Button
                  variant={page === boltProjectsPage ? 'default' : 'ghost'}
                  size="icon"
                  class="h-8 w-8 text-xs transition-colors {page === boltProjectsPage
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'border border-slate-800 hover:bg-slate-800'}"
                  on:click={() => goToBoltPage(page)}
                >
                  {page}
                </Button>
              {/if}
            {/each}

            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 border border-slate-800 hover:bg-slate-800 transition-colors"
              disabled={boltProjectsPage === boltProjectsTotalPages}
              on:click={() => goToBoltPage(boltProjectsPage + 1)}
            >
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- GitHub Repositories Section -->
    {#if showRepos}
      <div>
        <div class="flex items-center justify-between mb-3 px-1">
          <h2 class="text-sm font-semibold text-blue-500 flex items-center gap-2">
            <Github class="h-4 w-4" /> GitHub Repositories
            {#if !initialLoadingRepos && !loadingRepos}
              <span class="text-xs text-slate-400 font-normal">({totalRepos})</span>
            {/if}
            {#if loadingRepos}
              <Loader2 class="h-4 w-4 animate-spin text-blue-400 ml-1" />
            {/if}
          </h2>
          {#if reposTotalPages > 1 && !initialLoadingRepos && !loadingRepos}
            <div class="flex items-center gap-1 text-xs text-slate-400">
              Page {reposPage} of {reposTotalPages}
            </div>
          {/if}
        </div>

        {#if initialLoadingRepos}
          <!-- Initial loading state with skeleton -->
          <div class="space-y-2">
            <div class="text-xs text-slate-400 mb-3 flex items-center gap-2">
              <Loader2 class="h-4 w-4 animate-spin" />
              Loading your GitHub repositories...
            </div>
            {#each Array(3) as _}
              <div class="border border-slate-800 rounded-lg p-3 mb-2 animate-pulse">
                <div class="flex flex-col space-y-3">
                  <div class="h-5 bg-slate-700 rounded w-3/4"></div>
                  <div class="space-y-2">
                    <div class="h-3 bg-slate-800 rounded w-full"></div>
                    <div class="h-3 bg-slate-800 rounded w-5/6"></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else if loadingRepos}
          <!-- Refreshing state -->
          <div class="space-y-2">
            <div class="text-xs text-slate-400 mb-3 flex items-center gap-2">
              <Loader2 class="h-4 w-4 animate-spin" />
              Refreshing repositories...
            </div>
            {#each paginatedRepos as project}
              <div
                class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-all duration-200 group mb-2 opacity-60"
                role="button"
                tabindex="-1"
                aria-label="GitHub repository {project.repoName}"
              >
                <div class="relative">
                  <div class="w-full">
                    <h3 class="font-medium">
                      {project.repoName}
                      {project.branch ? `(${project.branch})` : ''}
                      {#if project.projectId === currentlyLoadedProjectId}
                        <span class="text-xs text-emerald-500 ml-2 font-semibold">(Current)</span>
                      {/if}
                      {#if project.gitHubRepo}
                        <span
                          class="text-xs {project.private ? 'text-red-400' : 'text-blue-400'} ml-2"
                        >
                          ({project.private ? 'Private' : 'Public'})
                        </span>
                      {/if}
                    </h3>
                    <div class="flex flex-col gap-1 text-xs text-slate-400">
                      {#if project.projectId}
                        <p>
                          Bolt ID: {project.projectId} (
                          {#if loadingCommitCounts[project.projectId]}
                            <span class="inline-flex items-center">
                              <div class="commit-loader"></div>
                            </span>
                          {:else}
                            {commitCounts[project.projectId] ?? '...'}
                          {/if} commits)
                        </p>
                      {/if}
                      {#if project.description}
                        <p class="text-slate-300">{project.description}</p>
                      {/if}
                      {#if project.language}
                        <p>Language: <span class="text-slate-300">{project.language}</span></p>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else if totalRepos === 0}
          <!-- No repos found -->
          <div
            class="flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-900/20 rounded-lg border border-slate-800"
          >
            <Github class="h-8 w-8 text-slate-600" />
            <p class="text-sm text-slate-400">No GitHub repositories found</p>
            <p class="text-xs text-slate-500">
              Try refreshing or check your GitHub token permissions
            </p>
          </div>
        {:else}
          <!-- Normal loaded state -->
          {#each paginatedRepos as project}
            <div
              class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-all duration-200 group mb-2"
              role="button"
              tabindex="-1"
              aria-label="GitHub repository {project.repoName}"
            >
              <div class="relative">
                <div class="w-full">
                  <h3 class="font-medium">
                    {project.repoName}
                    {project.branch ? `(${project.branch})` : ''}
                    {#if project.projectId === currentlyLoadedProjectId}
                      <span class="text-xs text-emerald-500 ml-2 font-semibold">(Current)</span>
                    {/if}
                    {#if project.gitHubRepo}
                      <span
                        class="text-xs {project.private ? 'text-red-400' : 'text-blue-400'} ml-2"
                      >
                        ({project.private ? 'Private' : 'Public'})
                      </span>
                    {/if}
                  </h3>
                  <div class="flex flex-col gap-1 text-xs text-slate-400">
                    {#if project.projectId}
                      <p>
                        Bolt ID: {project.projectId} (
                        {#if loadingCommitCounts[project.projectId]}
                          <span class="inline-flex items-center">
                            <div class="commit-loader"></div>
                          </span>
                        {:else}
                          {commitCounts[project.projectId] ?? '...'}
                        {/if} commits)
                      </p>
                    {/if}
                    {#if project.description}
                      <p class="text-slate-300">{project.description}</p>
                    {/if}
                    {#if project.language}
                      <p>Language: <span class="text-slate-300">{project.language}</span></p>
                    {/if}
                  </div>
                </div>

                <div
                  class="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-l from-slate-800/95 via-slate-800/80 to-transparent pl-8 pr-1 py-1 rounded-l-full"
                >
                  {#each renderProjectActions(project) as action}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={action.title}
                      class="h-8 w-8 {action.class} transition-colors"
                      on:click={action.action}
                    >
                      <svelte:component this={action.icon} class="h-5 w-5" />
                    </Button>
                  {/each}
                </div>
              </div>
            </div>
          {/each}

          <!-- GitHub Repositories Pagination -->
          {#if reposTotalPages > 1}
            <div class="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 border border-slate-800 hover:bg-slate-800 transition-colors"
                disabled={reposPage === 1}
                on:click={() => goToRepoPage(reposPage - 1)}
              >
                <ChevronLeft class="h-4 w-4" />
              </Button>

              {#each Array.from({ length: Math.min(5, reposTotalPages) }, (_, i) => {
                const startPage = Math.max(1, Math.min(reposPage - 2, reposTotalPages - 4));
                return startPage + i;
              }) as page}
                {#if page <= reposTotalPages}
                  <Button
                    variant={page === reposPage ? 'default' : 'ghost'}
                    size="icon"
                    class="h-8 w-8 text-xs transition-colors {page === reposPage
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'border border-slate-800 hover:bg-slate-800'}"
                    on:click={() => goToRepoPage(page)}
                  >
                    {page}
                  </Button>
                {/if}
              {/each}

              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 border border-slate-800 hover:bg-slate-800 transition-colors"
                disabled={reposPage === reposTotalPages}
                on:click={() => goToRepoPage(reposPage + 1)}
              >
                <ChevronRight class="h-4 w-4" />
              </Button>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}

  {#if importProgress}
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
      <div
        class="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <h3 class="font-medium mb-3 text-white">Importing {importProgress.repoName}</h3>
        <p class="text-sm text-slate-300 mb-4">{importProgress.status}</p>
        {#if importProgress.progress !== undefined}
          <div class="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div
              class="bg-gradient-to-r from-emerald-500 to-emerald-400 h-3 rounded-full transition-all duration-500 ease-out"
              style="width: {importProgress.progress}%"
            />
          </div>
          <p class="text-xs text-slate-400 mt-2 text-center">{importProgress.progress}%</p>
        {:else}
          <div class="flex items-center justify-center">
            <Loader2 class="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showDeleteModal}
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
      <div
        class="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <h3 class="font-medium mb-4 text-white">Delete Project</h3>

        {#if projectToDelete}
          <p class="text-sm text-slate-300 mb-4">
            Are you sure you want to delete the project <span class="font-semibold text-white"
              >{projectToDelete.repoName}</span
            >?
          </p>
        {/if}

        <p class="text-xs text-amber-400 mb-6">
          This will only remove the project(s) from this extension. The GitHub repositories will not
          be affected.
        </p>

        <div class="flex justify-end gap-3">
          <Button
            variant="ghost"
            class="border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors"
            on:click={() => {
              showDeleteModal = false;
              projectToDelete = null;
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            class="bg-red-600 hover:bg-red-700 text-white transition-colors"
            on:click={deleteProject}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  {/if}

  {#if showSettingsModal && projectToEdit}
    <RepoSettings
      show={showSettingsModal}
      {repoOwner}
      {githubToken}
      projectId={projectToEdit.projectId}
      repoName={projectToEdit.repoName}
      branch={projectToEdit.branch}
      projectTitle={projectToEdit.projectTitle || projectToEdit.repoName}
      on:close={() => {
        showSettingsModal = false;
        projectToEdit = null;
      }}
    />
  {/if}

  {#if showBranchSelectionModal && repoToImport}
    <BranchSelectionModal
      show={showBranchSelectionModal}
      owner={repoToImport.owner}
      repo={repoToImport.repo}
      token={githubToken}
      onBranchSelected={handleBranchSelected}
      onCancel={() => {
        showBranchSelectionModal = false;
        repoToImport = null;
      }}
    />
  {/if}

  {#if showImportConfirmDialog && repoToConfirmImport}
    <ConfirmationDialog
      show={showImportConfirmDialog}
      title="Import Private Repository"
      message="This will temporarily create a <strong>public copy</strong> of your private repository to enable import.<br><br>The temporary repository will be automatically deleted after 1 minute.<br><br>Do you want to continue?"
      type="warning"
      confirmText="Continue Import"
      cancelText="Cancel"
      onConfirm={handleImportConfirm}
      onCancel={handleImportCancel}
    />
  {/if}
</div>

<style>
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .commit-loader {
    width: 12px;
    height: 12px;
    border: 1.5px solid #334155;
    border-top: 1.5px solid #64748b;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
</style>
