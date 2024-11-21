<script lang="ts">
  import { AlertTriangle } from "lucide-svelte";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert";
  import { createEventDispatcher } from "svelte";

  export let isSettingsValid: boolean;

  const dispatch = createEventDispatcher<{
    switchTab: string;
  }>();

  function handleMissingConfigClick(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    if (!isSettingsValid) {
      dispatch("switchTab", "settings");
    }
  }
</script>

{#if !isSettingsValid}
  <div
    class="cursor-pointer"
    on:click|stopPropagation={handleMissingConfigClick}
    on:keydown|stopPropagation={(e) =>
      e.key === "Enter" && handleMissingConfigClick(e)}
    role="button"
    tabindex={0}
  >
    <Alert
      variant="destructive"
      class="mb-4 border-red-900 bg-red-950 hover:bg-red-900/50 transition-colors"
    >
      <AlertTriangle class="h-4 w-4" />
      <AlertTitle>Missing Configuration</AlertTitle>
      <AlertDescription class="text-slate-300">
        Click here to configure your GitHub settings
      </AlertDescription>
    </Alert>
  </div>
{:else}
  <Alert class="border-green-900 bg-green-950">
    <AlertTitle>Ready to Use</AlertTitle>
    <AlertDescription class="text-slate-300">
      Your GitHub configuration is set up and ready to go!
    </AlertDescription>
  </Alert>
{/if}
