<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Github, Import, Zap } from "lucide-svelte";

  export let projectSettings: Record<string, { repoName: string; branch: string }>;
  export let repoOwner: string;

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
        <p class="text-sm text-slate-400">No projects found. Create a new project to get started.</p>
      </div>
      <Button
        variant="outline"
        class="border-slate-800 hover:bg-slate-800 text-slate-200"
        on:click={() => window.open('https://bolt.new', '_blank')}
      >
        Go to bolt.new
      </Button>
    </div>
  {:else}
    {#each Object.entries(projectSettings) as [projectId, settings]}
      <div class="border border-slate-800 rounded-lg p-3 hover:bg-slate-800/50 transition-colors group">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <h3 class="font-medium">{settings.repoName} ({settings.branch})</h3>
            <p class="text-xs text-slate-400">Bolt ID: {projectId}</p>
          </div>
          <div class="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Open in Bolt"
              class="h-8 w-8 opacity-70 group-hover:opacity-100"
              on:click={() => openBoltProject(projectId)}
            >
              <Zap class="h-5 w-5" />
            </Button>
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