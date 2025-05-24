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
  } from 'lucide-svelte';
  import RepoSettings from '$lib/components/RepoSettings.svelte';
  import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
  import { GitHubService } from '../../services/GitHubService';
  import { fade } from 'svelte/transition';
  import BranchSelectionModal from '../../popup/components/BranchSelectionModal.svelte';
  import { githubSettingsStore, githubSettingsActions, currentProjectId } from '$lib/stores';
  import { triggerUpgradeModal } from '$lib/utils/upgradeModal';

  export let repoOwner: string;
  export let githubToken: string;
  export let isBoltSite: boolean = true;
  export let currentlyLoadedProjectId: string | null = null;

  // Use stores instead of props
  $: projectSettings = $githubSettingsStore.projectSettings;

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
  let showDeleteModal = false;
  let projectToDelete: { projectId: string; repoName: string } | null = null;
  let showSettingsModal = false;
  let projectToEdit: { projectId: string; repoName: string; branch: string } | null = null;
  let showBranchSelectionModal = false;
  let repoToImport: { owner: string; repo: string; isPrivate: boolean } | null = null;

  // Add confirmation dialog state
  let showImportConfirmDialog = false;
  let repoToConfirmImport: { owner: string; repo: string; isPrivate: boolean } | null = null;

  const githubService = new GitHubService(githubToken);
  let commitCounts: Record<string, number> = {};
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

  // Reset pagination when search changes
  $: if (searchQuery !== undefined) {
    boltProjectsPage = 1;
    reposPage = 1;
  }

  // Filter and paginate logic
  $: {
    const existingProjects = Object.entries(projectSettings).map(([projectId, settings]) => ({
      projectId,
      repoName: settings.repoName,
      branch: settings.branch,
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
    const searchFiltered = allProjects.filter((project) =>
      project.repoName.toLowerCase().includes(searchQuery.toLowerCase())
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

  async function loadAllRepos() {
    console.log('Loading repos for', repoOwner);
    try {
      loadingRepos = true;
      allRepos = await githubService.listRepos();
      // Simulate a delay to show the loading spinner
      await new Promise((resolve) => setTimeout(resolve, 1000));
      loadingRepos = false;
    } catch (error) {
      loadingRepos = false;
      console.error('Failed to load repos:', error);
    }
  }

  // Function to refresh project data
  async function refreshProjectData() {
    console.log('Refreshing project data in ProjectsList');

    // Fetch commit counts for projects that have IDs
    for (const [projectId, settings] of Object.entries(projectSettings)) {
      commitCounts[projectId] = await githubService.getCommitCount(
        repoOwner,
        settings.repoName,
        settings.branch
      );
    }

    // Force a UI update by creating a new object
    commitCounts = { ...commitCounts };
  }

  onMount(() => {
    // Initialize data (async)
    const initializeData = async () => {
      // Get current tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTabIsBolt = tab?.url?.includes('bolt.new') ?? false;

      // Load all repos
      await loadAllRepos();

      // Initial load of commit counts
      await refreshProjectData();
    };

    // Start initialization
    initializeData();
  });

  // Watch for changes in projectSettings from the store and refresh data
  $: if (projectSettings && Object.keys(projectSettings).length > 0) {
    refreshProjectData();
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
                openRepoSettings(project.projectId, project.repoName, project.branch || 'main'),
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

  function openRepoSettings(projectId: string, repoName: string, branch: string) {
    projectToEdit = { projectId, repoName, branch };
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
      }

      // Close the modal and reset state
      showDeleteModal = false;
      projectToDelete = null;
    } catch (error) {
      console.error('Failed to delete project(s):', error);
    }
  }

  async function importFromGitHub(repoOwner: string, repoName: string, isPrivate: boolean) {
    if (!isPrivate) {
      window.open(`https://bolt.new/~/github.com/${repoOwner}/${repoName}`, '_blank');
      return;
    }

    // Check premium access for branch selector on private repos
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_PREMIUM_FEATURE',
        feature: 'branchSelector',
      });
      if (!response.hasAccess) {
        // Show upgrade modal for branch selector
        // Use the unified upgrade modal system
        triggerUpgradeModal('branchSelector');
        return;
      }
    } catch (error) {
      console.warn('Failed to check premium status, allowing access:', error);
    }

    // Store the repo info and show confirmation dialog
    repoToConfirmImport = { owner: repoOwner, repo: repoName, isPrivate };
    showImportConfirmDialog = true;
  }

  function handleImportConfirm() {
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
    } catch (error) {
      console.error('❌ Failed to import private repository:', error);
      alert('Failed to import private repository. Please try again later.');
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
</script>

<div class="space-y-2">
  <div class="flex items-center gap-2 mb-4">
    <div class="flex-1 relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search projects..."
        class="w-full bg-transparent border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-700"
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
        class="border-slate-800 hover:bg-slate-800 text-slate-200"
        title="Refresh Repos"
        disabled={loadingRepos}
        on:click={loadAllRepos}
      >
        {#if loadingRepos}
          <RefreshCw class="animate-spin h-5 w-5" />
        {:else}
          <RefreshCw class="h-5 w-5" />
        {/if}
      </Button>
    {/if}
  </div>

  {#if totalBoltProjects === 0 && totalRepos === 0}
    <div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
      <div class="space-y-2">
        {#if !isBoltSite}
          <Button
            variant="outline"
            class="border-slate-800 hover:bg-slate-800 text-slate-200"
            on:click={() => window.open('https://bolt.new', '_blank')}
          >
            Go to bolt.new
          </Button>
        {/if}
        <p class="text-sm text-green-400">
          💡 No Bolt projects found. Create or load an existing Bolt project to get started.
        </p>
        <p class="text-sm text-green-400">🌟 You can also load any of your GitHub repositories.</p>
      </div>
    </div>
  {:else}
    <!-- Bolt Projects Section -->
    {#if totalBoltProjects > 0}
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2 px-1">
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
            class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-colors relative mb-2 group {project.projectId ===
            currentlyLoadedProjectId
              ? 'bg-slate-800/30 border-slate-700'
              : ''}"
            role="button"
            tabindex="-1"
            aria-label="Bolt project {project.repoName}"
          >
            <div class="flex flex-col">
              <div class="relative">
                <div class="w-full">
                  <h3 class="font-medium">
                    {project.repoName}
                    {project.branch ? `(${project.branch})` : ''}
                    {#if project.projectId === currentlyLoadedProjectId}
                      <span class="text-xs text-emerald-500 ml-2">(Current)</span>
                    {/if}
                    {#if project.gitHubRepo}
                      <span
                        class="text-xs {project.private ? 'text-red-500' : 'text-blue-500'} ml-2"
                      >
                        ({project.private ? 'Private' : 'Public'})
                      </span>
                    {/if}
                  </h3>
                  <div class="flex flex-col gap-1 text-xs text-slate-400 mt-1">
                    {#if project.projectId}
                      <p>
                        Bolt ID: {project.projectId} ({commitCounts[project.projectId] ?? '...'} commits)
                      </p>
                    {/if}
                    {#if project.description}
                      <p>{project.description}</p>
                    {/if}
                    {#if project.language}
                      <p>Language: {project.language}</p>
                    {/if}
                  </div>
                </div>

                <div
                  class="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-slate-800/90 via-slate-800/70 to-transparent pl-8 pr-1 py-1 rounded-l-full"
                >
                  {#each renderProjectActions(project) as action}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={action.title}
                      class="h-8 w-8 {action.class}"
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
          <div class="flex items-center justify-center gap-2 mt-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 border border-slate-800 hover:bg-slate-800"
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
                  class="h-8 w-8 text-xs {page === boltProjectsPage
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
              class="h-8 w-8 border border-slate-800 hover:bg-slate-800"
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
    {#if totalRepos > 0}
      <div>
        <div class="flex items-center justify-between mb-2 px-1">
          <h2 class="text-sm font-semibold text-blue-500 flex items-center gap-2">
            <Github class="h-4 w-4" /> GitHub Repositories
            <span class="text-xs text-slate-400 font-normal">({totalRepos})</span>
          </h2>
          {#if reposTotalPages > 1}
            <div class="flex items-center gap-1 text-xs text-slate-400">
              Page {reposPage} of {reposTotalPages}
            </div>
          {/if}
        </div>

        {#each paginatedRepos as project}
          <div
            class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-colors group mb-2"
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
                    <span class="text-xs text-emerald-500 ml-2">(Current)</span>
                  {/if}
                  {#if project.gitHubRepo}
                    <span class="text-xs {project.private ? 'text-red-500' : 'text-blue-500'} ml-2">
                      ({project.private ? 'Private' : 'Public'})
                    </span>
                  {/if}
                </h3>
                <div class="flex flex-col gap-1 text-xs text-slate-400">
                  {#if project.projectId}
                    <p>
                      Bolt ID: {project.projectId} ({commitCounts[project.projectId] ?? '...'} commits)
                    </p>
                  {/if}
                  {#if project.description}
                    <p>{project.description}</p>
                  {/if}
                  {#if project.language}
                    <p>Language: {project.language}</p>
                  {/if}
                </div>
              </div>

              <div
                class="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-slate-800/90 via-slate-800/70 to-transparent pl-8 pr-1 py-1 rounded-l-full"
              >
                {#each renderProjectActions(project) as action}
                  <Button
                    variant="ghost"
                    size="icon"
                    title={action.title}
                    class="h-8 w-8 {action.class}"
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
          <div class="flex items-center justify-center gap-2 mt-3">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 border border-slate-800 hover:bg-slate-800"
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
                  class="h-8 w-8 text-xs {page === reposPage
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
              class="h-8 w-8 border border-slate-800 hover:bg-slate-800"
              disabled={reposPage === reposTotalPages}
              on:click={() => goToRepoPage(reposPage + 1)}
            >
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  {#if importProgress}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div class="bg-slate-900 border border-slate-800 rounded-lg p-4 max-w-sm w-full mx-4">
        <h3 class="font-medium mb-2">Importing {importProgress.repoName}</h3>
        <p class="text-sm text-slate-400 mb-3">{importProgress.status}</p>
        {#if importProgress.progress !== undefined}
          <div class="w-full bg-slate-800 rounded-full h-2">
            <div
              class="bg-emerald-500 h-2 rounded-full transition-all duration-300"
              style="width: {importProgress.progress}%"
            />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showDeleteModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div class="bg-slate-900 border border-slate-800 rounded-lg p-4 max-w-sm w-full mx-4">
        <h3 class="font-medium mb-3">Delete Project</h3>

        {#if projectToDelete}
          <p class="text-sm text-slate-300 mb-4">
            Are you sure you want to delete the project <span class="font-semibold text-white"
              >{projectToDelete.repoName}</span
            >?
          </p>
        {/if}

        <p class="text-xs text-amber-400 mb-4">
          This will only remove the project(s) from this extension. The GitHub repositories will not
          be affected.
        </p>

        <div class="flex justify-end gap-2">
          <Button
            variant="ghost"
            class="border-slate-800 hover:bg-slate-800 text-slate-200"
            on:click={() => {
              showDeleteModal = false;
              projectToDelete = null;
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            class="bg-red-600 hover:bg-red-700 text-white"
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
