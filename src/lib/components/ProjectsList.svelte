<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Github, Import, Zap, X, RefreshCw } from 'lucide-svelte';
  import { GitHubService } from '../../services/GitHubService';

  export let projectSettings: Record<string, { repoName: string; branch: string }>;
  export let repoOwner: string;
  export let githubToken: string;
  export let isBoltSite: boolean = true;
  export let currentlyLoadedProjectId: string | null = null;

  let loadingRepos = false;

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
  let filteredProjects: Array<{
    projectId?: string;
    repoName: string;
    branch?: string;
    gitHubRepo?: boolean;
    description?: string | null;
    private?: boolean;
    language?: string | null;
  }> = [];

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

  $: {
    const existingProjects = Object.entries(projectSettings).map(([projectId, settings]) => ({
      projectId,
      repoName: settings.repoName,
      branch: settings.branch,
      gitHubRepo: false,
    }));

    const repos = showRepos
      ? allRepos
          .filter((repo) => !Object.values(projectSettings).some((s) => s.repoName === repo.name))
          .map((repo) => ({
            repoName: repo.name,
            gitHubRepo: true,
            private: repo.private,
            description: repo.description,
            language: repo.language,
          }))
      : [];

    filteredProjects = [...existingProjects, ...repos].filter((project) =>
      project.repoName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  onMount(async () => {
    // Load all repos
    await loadAllRepos();

    // Fetch commit counts for projects that have IDs
    for (const [projectId, settings] of Object.entries(projectSettings)) {
      commitCounts[projectId] = await githubService.getCommitCount(
        repoOwner,
        settings.repoName,
        settings.branch
      );
    }
  });

  function openBoltProject(projectId: string) {
    window.open(`https://bolt.new/~/${projectId}`, '_blank');
  }

  function openGitHubRepo(repoOwner: string, repoName: string) {
    window.open(`https://github.com/${repoOwner}/${repoName}`, '_blank');
  }

  async function importFromGitHub(repoOwner: string, repoName: string, isPrivate: boolean) {
    if (!isPrivate) {
      window.open(`https://bolt.new/~/github.com/${repoOwner}/${repoName}`, '_blank');
      return;
    }

    if (
      !confirm(
        'Warning: This will temporarily create a public copy of your private repository to enable import.\n\n' +
          'The temporary repository will be automatically deleted after 2 minutes.\n\n' +
          'Do you want to continue?'
      )
    ) {
      return;
    }

    try {
      console.log('🔄 Sending message to import private repo:', repoName);
      // Send message directly to background service
      const port = chrome.runtime.connect({ name: 'popup' });

      // Set up listener first
      port.onMessage.addListener((message) => {
        if (message.type === 'UPLOAD_STATUS') {
          console.log('📥 Import status update:', message.status);
        }
      });

      // Then send message
      port.postMessage({
        type: 'IMPORT_PRIVATE_REPO',
        data: { repoName },
      });

      // Close the popup to prevent UI overlap
      window.close();
    } catch (error) {
      console.error('❌ Failed to import private repository:', error);
      alert('Failed to import private repository. Please try again later.');
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

  {#if filteredProjects.length === 0}
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
    {#each filteredProjects as project}
      <div
        class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-colors group {project.projectId ===
        currentlyLoadedProjectId
          ? 'bg-slate-800/30 border-slate-700'
          : ''}"
      >
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
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
          <div class="flex gap-1">
            {#if project.projectId && project.projectId !== currentlyLoadedProjectId}
              <Button
                variant="ghost"
                size="icon"
                title="Open in Bolt"
                class="h-8 w-8 opacity-70 group-hover:opacity-100"
                on:click={() => project.projectId && openBoltProject(project.projectId)}
              >
                <Zap class="h-5 w-5" />
              </Button>
            {/if}
            <Button
              variant="ghost"
              size="icon"
              title="Open GitHub Repository"
              class="h-8 w-8 opacity-70 group-hover:opacity-100"
              on:click={() => openGitHubRepo(repoOwner, project.repoName)}
            >
              <Github class="h-5 w-5" />
            </Button>
            {#if !project.projectId}
              <Button
                variant="ghost"
                size="icon"
                title="Import from GitHub to Bolt"
                class="h-8 w-8 opacity-70 group-hover:opacity-100"
                on:click={() =>
                  importFromGitHub(repoOwner, project.repoName, project.private ?? false)}
              >
                <Import class="h-5 w-5" />
              </Button>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>
