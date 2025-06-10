<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { ChevronDown, X, Zap, Github, ArrowRight, Info, Import } from 'lucide-svelte';

  export let isBoltSite: boolean = false;
  export let totalBoltProjects: number = 0;
  export let totalRepos: number = 0;

  let isExpanded = true;
  let isDismissed = false;
  const STORAGE_KEY = 'projectsListGuideDismissed';
  const COLLAPSED_KEY = 'projectsListGuideCollapsed';

  // Only show guide for users with few projects
  $: shouldShowGuide = !isDismissed && totalBoltProjects < 3;

  onMount(() => {
    // Check if user has previously dismissed the guide
    const dismissed = localStorage.getItem(STORAGE_KEY);
    const collapsed = localStorage.getItem(COLLAPSED_KEY);

    if (dismissed === 'true') {
      isDismissed = true;
    }
    if (collapsed === 'true') {
      isExpanded = false;
    }
  });

  function toggleExpanded() {
    isExpanded = !isExpanded;
    localStorage.setItem(COLLAPSED_KEY, (!isExpanded).toString());
  }

  function dismiss() {
    isDismissed = true;
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  function openBoltNew() {
    window.open('https://bolt.new', '_blank');
  }
</script>

{#if shouldShowGuide}
  <div class="mb-4">
    <Alert
      class="border-blue-800/50 bg-gradient-to-r from-blue-950/50 to-purple-950/50 backdrop-blur-sm [&>svg]:hidden [&:has(svg)]:pl-4"
    >
      <div class="relative">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <Info class="h-4 w-4 text-blue-400" />
            <h3 class="font-semibold text-sm text-blue-200">Quick Start Guide</h3>
          </div>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-slate-400 hover:text-slate-300"
              on:click={toggleExpanded}
            >
              <ChevronDown
                class="h-4 w-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-slate-400 hover:text-slate-300"
              on:click={dismiss}
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>

        {#if isExpanded}
          <AlertDescription class="space-y-3 text-sm">
            {#if !isBoltSite}
              <!-- Guide for non-bolt.new pages -->
              <div class="space-y-3">
                <p class="text-slate-300">
                  Welcome! Here's how to get started with Bolt to GitHub:
                </p>

                <div class="grid gap-3">
                  <!-- Option 1: Import GitHub Repo -->
                  <div
                    class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
                  >
                    <div class="flex-shrink-0 mt-0.5">
                      <div
                        class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center"
                      >
                        <Github class="h-4 w-4 text-blue-400" />
                      </div>
                    </div>
                    <div class="flex-1">
                      <h4 class="font-medium text-slate-200 mb-1">
                        Import Your GitHub Repositories
                      </h4>
                      <p class="text-xs text-slate-400 mb-2">
                        Click the <Import class="inline h-3 w-3" /> icon next to any repository below
                        to import it into Bolt. Both public and private repositories are supported.
                      </p>
                    </div>
                  </div>

                  <!-- Option 2: Create New Bolt Project -->
                  <div
                    class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
                  >
                    <div class="flex-shrink-0 mt-0.5">
                      <div
                        class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"
                      >
                        <Zap class="h-4 w-4 text-emerald-400" />
                      </div>
                    </div>
                    <div class="flex-1">
                      <h4 class="font-medium text-slate-200 mb-1">Create a New Bolt Project</h4>
                      <p class="text-xs text-slate-400 mb-2">
                        Open bolt.new to create a new project. Once loaded, you can push it to
                        GitHub using this extension.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        class="h-7 text-xs border-emerald-700 hover:bg-emerald-900/30 text-emerald-300"
                        on:click={openBoltNew}
                      >
                        Go to bolt.new
                        <ArrowRight class="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            {:else}
              <!-- Guide for bolt.new pages -->
              <div class="space-y-3">
                <p class="text-slate-300">You're on bolt.new! Here's what you can do:</p>

                <div class="grid gap-3">
                  <!-- Push to GitHub -->
                  <div
                    class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
                  >
                    <div class="flex-shrink-0 mt-0.5">
                      <div
                        class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"
                      >
                        <Zap class="h-4 w-4 text-emerald-400" />
                      </div>
                    </div>
                    <div class="flex-1">
                      <h4 class="font-medium text-slate-200 mb-1">
                        Push Your Bolt Project to GitHub
                      </h4>
                      <p class="text-xs text-slate-400">
                        Open a Bolt project, then click the extension icon to configure repository
                        settings and push your code to GitHub.
                      </p>
                    </div>
                  </div>

                  <!-- Import from GitHub -->
                  <div
                    class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
                  >
                    <div class="flex-shrink-0 mt-0.5">
                      <div
                        class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center"
                      >
                        <Github class="h-4 w-4 text-blue-400" />
                      </div>
                    </div>
                    <div class="flex-1">
                      <h4 class="font-medium text-slate-200 mb-1">Import Existing Repositories</h4>
                      <p class="text-xs text-slate-400">
                        Use the <Import class="inline h-3 w-3" /> icon below to import any of your GitHub
                        repositories into Bolt. Private repos will be temporarily cloned for import.
                      </p>
                    </div>
                  </div>
                </div>

                {#if totalBoltProjects === 0 && totalRepos > 0}
                  <div class="mt-2 p-2 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                    <p class="text-xs text-amber-300">
                      💡 Tip: Import one of your repositories below to start working with it in
                      Bolt!
                    </p>
                  </div>
                {/if}
              </div>
            {/if}
          </AlertDescription>
        {:else}
          <p class="text-xs text-slate-400 italic">Click to expand the quick start guide</p>
        {/if}
      </div>
    </Alert>
  </div>
{/if}

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
