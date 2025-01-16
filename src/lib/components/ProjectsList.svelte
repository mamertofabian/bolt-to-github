<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Github, Import, Zap, X } from 'lucide-svelte';
  import { GitHubService } from '../../services/GitHubService';

  export let projectSettings: Record<string, { repoName: string; branch: string }>;
  export let repoOwner: string;
  export let githubToken: string;
  export let isBoltSite: boolean = true;
  export let currentlyLoadedProjectId: string | null = null;

  const githubService = new GitHubService(githubToken);
  let commitCounts: Record<string, number> = {};
  let publicRepos: Array<{
    name: string;
    description: string | null;
    html_url: string;
    created_at: string;
    updated_at: string;
    language: string | null;
  }> = [];

  let searchQuery = '';
  let showPublicRepos = false;
  let filteredProjects: Array<{
    projectId?: string;
    repoName: string;
    branch?: string;
    isPublicOnly?: boolean;
    description?: string | null;
    language?: string | null;
  }> = [];

  async function loadPublicRepos() {
    console.log('Loading public repos for', repoOwner);
    try {
      publicRepos = await githubService.listPublicRepos(repoOwner);
    } catch (error) {
      console.error('Failed to load public repos:', error);
    }
  }

  $: {
    const existingProjects = Object.entries(projectSettings).map(([projectId, settings]) => ({
      projectId,
      repoName: settings.repoName,
      branch: settings.branch,
      isPublicOnly: false,
    }));

    const publicOnlyRepos = showPublicRepos
      ? publicRepos
          .filter((repo) => !Object.values(projectSettings).some((s) => s.repoName === repo.name))
          .map((repo) => ({
            repoName: repo.name,
            isPublicOnly: true,
            description: repo.description,
            language: repo.language,
          }))
      : [];

    filteredProjects = [...existingProjects, ...publicOnlyRepos].filter((project) =>
      project.repoName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  onMount(async () => {
    // Load public repos
    await loadPublicRepos();

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

  function importFromGitHub(repoOwner: string, repoName: string) {
    window.open(`https://bolt.new/~/github.com/${repoOwner}/${repoName}`, '_blank');
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
        bind:checked={showPublicRepos}
        class="w-4 h-4 rounded border-slate-800 bg-transparent"
      />
      Show Public Repos
    </label>
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
        <p class="text-sm text-green-400">
          🌟 You can also load any of your public GitHub repositories.
        </p>
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
              {#if project.isPublicOnly}
                <span class="text-xs text-blue-500 ml-2">(Public Repo)</span>
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
                on:click={() => importFromGitHub(repoOwner, project.repoName)}
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
