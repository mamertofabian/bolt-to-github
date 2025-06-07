<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Zap, Github, ArrowRight, Lightbulb, FileText, Bug, Settings } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{
    switchTab: string;
  }>();

  function switchToProjectsTab() {
    dispatch('switchTab', 'projects');
  }

  function openBoltNew() {
    window.open('https://bolt.new', '_blank');
  }
</script>

<div class="space-y-4">
  <!-- Main Guide Alert -->
  <Alert
    class="border-emerald-800/50 bg-gradient-to-r from-emerald-950/50 to-green-950/50 backdrop-blur-sm [&>svg]:hidden [&:has(svg)]:pl-4"
  >
    <div class="relative">
      <div class="flex items-start gap-3 mb-3">
        <div class="flex-shrink-0 mt-0.5">
          <div class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Lightbulb class="h-4 w-4 text-emerald-400" />
          </div>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-sm text-emerald-200 mb-2">Ready to Code!</h3>
          <AlertDescription class="space-y-3 text-sm">
            <p class="text-slate-300">
              Your extension is configured and ready to use. Here's how to get started:
            </p>
          </AlertDescription>
        </div>
      </div>

      <div class="grid gap-3">
        <!-- Create New Project -->
        <div
          class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
        >
          <div class="flex-shrink-0 mt-0.5">
            <div class="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Zap class="h-3 w-3 text-emerald-400" />
            </div>
          </div>
          <div class="flex-1">
            <h4 class="font-medium text-slate-200 mb-1">Create or Open a Bolt Project</h4>
            <p class="text-xs text-slate-400 mb-2">
              Start a new project or open an existing project on bolt.new, then open the extension
              or use the GitHub button on bolt.new.
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

        <!-- Import Existing Project -->
        <div
          class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
        >
          <div class="flex-shrink-0 mt-0.5">
            <div class="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Github class="h-3 w-3 text-blue-400" />
            </div>
          </div>
          <div class="flex-1">
            <h4 class="font-medium text-slate-200 mb-1">Import from GitHub</h4>
            <p class="text-xs text-slate-400 mb-2">
              Browse and import any of your existing GitHub repositories into Bolt.
            </p>
            <Button
              size="sm"
              variant="outline"
              class="h-7 text-xs border-blue-700 hover:bg-blue-900/30 text-blue-300"
              on:click={switchToProjectsTab}
            >
              Browse Projects
              <ArrowRight class="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Alert>

  <!-- Features Overview -->
  <Alert class="border-slate-700/50 bg-slate-900/30 [&>svg]:hidden [&:has(svg)]:pl-4">
    <div class="relative">
      <h3 class="font-semibold text-sm text-slate-200 mb-3">What You Can Do</h3>
      <AlertDescription class="space-y-3 text-sm">
        <div class="grid gap-2">
          <!-- Push to GitHub -->
          <div class="flex items-center gap-3 text-xs">
            <div
              class="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0"
            >
              <ArrowRight class="h-3 w-3 text-green-400" />
            </div>
            <span class="text-slate-300">Push Bolt projects to GitHub repositories</span>
          </div>

          <!-- File Changes -->
          <div class="flex items-center gap-3 text-xs">
            <div
              class="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0"
            >
              <FileText class="h-3 w-3 text-amber-400" />
            </div>
            <span class="text-slate-300">Preview file changes before pushing</span>
          </div>

          <!-- Issues Management -->
          <div class="flex items-center gap-3 text-xs">
            <div
              class="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0"
            >
              <Bug class="h-3 w-3 text-purple-400" />
            </div>
            <span class="text-slate-300">Manage GitHub issues directly from Bolt</span>
          </div>

          <!-- Repository Settings -->
          <div class="flex items-center gap-3 text-xs">
            <div
              class="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0"
            >
              <Settings class="h-3 w-3 text-blue-400" />
            </div>
            <span class="text-slate-300">Configure repository settings and branches</span>
          </div>
        </div>
      </AlertDescription>
    </div>
  </Alert>
</div>

<style>
  :global(.lucide) {
    stroke-width: 1.5px;
  }
</style>
