<script lang="ts">
  import { AlertTriangle } from "lucide-svelte";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert";
  import { createEventDispatcher } from "svelte";

  export let isSettingsValid: boolean;
  export let projectId: string | null;
  export let repoName: string;
  export let branch: string;

  const dispatch = createEventDispatcher<{
    switchTab: string;
  }>();

  function handleConfigClick(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    if (!isSettingsValid) {
      dispatch("switchTab", "settings");
    }
  }

  $: console.log(`📄 StatusAlert: ${projectId}`);
</script>

{#if !isSettingsValid || !projectId}
  <div
    class="cursor-pointer"
    on:click|stopPropagation={handleConfigClick}
    on:keydown|stopPropagation={(e) =>
      e.key === "Enter" && handleConfigClick(e)}
    role="button"
    tabindex={0}
  >
    <Alert
      variant="destructive"
      class="mb-4 border-red-900 bg-red-900/20 hover:bg-red-900/30 transition-colors"
    >
      <AlertTriangle class="h-4 w-4 text-red-400" />
      <AlertTitle class="text-red-200">Missing Configuration</AlertTitle>
      <AlertDescription class="text-red-100">
        Click here to configure your GitHub settings
      </AlertDescription>
    </Alert>
  </div>
{:else}
  <Alert class="border-green-900 bg-green-950">
    <AlertTitle>Ready to Use</AlertTitle>
    <AlertDescription class="text-slate-300">
      Your GitHub configuration is set up and ready to go!
      <div 
        class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 bg-slate-900/50 p-2 rounded-sm cursor-pointer hover:bg-slate-900/70 transition-colors group"
        on:click={() => dispatch("switchTab", "settings")}
        on:keydown={(e) => e.key === "Enter" && dispatch("switchTab", "settings")}
        role="button"
        tabindex={0}
      >
        <span>Project ID:</span>
        <span class="font-mono">{projectId}</span>
        <span>Repository:</span>
        <span class="font-mono">{repoName}</span>
        <span>Branch:</span>
        <span class="font-mono">{branch}</span>
        <span class="col-span-2 text-sm text-slate-400 mt-1">Click to edit settings</span>
      </div>
    </AlertDescription>
  </Alert>
{/if}
