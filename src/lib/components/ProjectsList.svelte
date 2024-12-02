<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from "$lib/components/ui/button";
  import { Github, Import, Zap, X } from "lucide-svelte";
  import { GitHubService } from '../../services/GitHubService';

  export let projectSettings: Record<string, { repoName: string; branch: string }>;
  export let repoOwner: string;
  export let githubToken: string;
  export let isBoltSite: boolean = true;
  export let currentlyLoadedProjectId: string | null = null;

  const githubService = new GitHubService(githubToken);
  let commitCounts: Record<string, number> = {};

  let searchQuery = '';
  let filteredProjects: [string, { repoName: string; branch: string }][] = [];

  $: {
    filteredProjects = Object.entries(projectSettings)
      .filter(([projectId, settings]) => {
        // Only apply search filter
        const matchesSearch = settings.repoName.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
      });
  }

  onMount(async () => {
    // Fetch commit counts for all projects
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
  {#if Object.keys(projectSettings).length === 0}
    <div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
      <div class="space-y-2">
        <p class="text-sm text-slate-400 text-orange-400">No projects found. Create or load an existing project to get started.</p>
      </div>
      {#if !isBoltSite}
        <Button
          variant="outline"
          class="border-slate-800 hover:bg-slate-800 text-slate-200"
          on:click={() => window.open('https://bolt.new', '_blank')}
        >
          Go to bolt.new
        </Button>
      {/if}
    </div>
  {:else}
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
            on:click={() => searchQuery = ''}
          >
            <X class="h-4 w-4" />
          </Button>
        {/if}
      </div>
    </div>

    {#each filteredProjects as [projectId, settings]}
      <div class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-colors group {currentlyLoadedProjectId === projectId ? 'bg-slate-800/30 border-slate-700' : ''}">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <h3 class="font-medium">
              {settings.repoName} ({settings.branch})
              {#if currentlyLoadedProjectId === projectId}
                <span class="text-xs text-emerald-500 ml-2">(Current)</span>
              {/if}
            </h3>
            <div class="flex gap-2 text-xs text-slate-400">
              <p>Bolt ID: {projectId} ({commitCounts[projectId] ?? '...'} commits)</p>
            </div>
          </div>
          <div class="flex gap-1">
            {#if currentlyLoadedProjectId !== projectId}
              <Button
                variant="ghost"
                size="icon"
                title="Open in Bolt"
                class="h-8 w-8 opacity-70 group-hover:opacity-100"
                on:click={() => openBoltProject(projectId)}
              >
                <Zap class="h-5 w-5" />
              </Button>
            {/if}
            <Button
              variant="ghost"
              size="icon"
              title="Open GitHub Repository"
              class="h-8 w-8 opacity-70 group-hover:opacity-100"
              on:click={() => openGitHubRepo(repoOwner, settings.repoName)}
            >
              <Github class="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Import from GitHub to Bolt"
              class="h-8 w-8 opacity-70 group-hover:opacity-100"
              on:click={() => importFromGitHub(repoOwner, settings.repoName)}
            >
              <Import class="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div> 