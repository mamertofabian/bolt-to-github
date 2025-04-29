<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';

  export let show = false;
  export let tempRepoData: TempRepoMetadata | null = null;
  export let hasDeletedTempRepo = false;
  export let hasUsedTempRepoName = false;

  export let onDeleteTempRepo: () => Promise<void>;
  export let onUseTempRepoName: () => Promise<void>;
  export let onDismiss: () => void;

  interface TempRepoMetadata {
    originalRepo: string;
    tempRepo: string;
    createdAt: number;
    owner: string;
  }
</script>

<Modal {show} title="Private Repository Import">
  <div class="space-y-3 pb-1">
    <p class="text-amber-300 text-xs font-medium pb-1 border-b border-slate-700">
      It looks like you just imported a private GitHub repository. Would you like to:
    </p>

    <div class="space-y-2">
      {#if !hasDeletedTempRepo}
        <div class="space-y-1">
          <p class="text-xs text-slate-300">1. Clean up the temporary repository:</p>
          <Button
            variant="outline"
            class="w-full text-xs py-1 h-7 border-slate-700 bg-slate-800 hover:bg-slate-700"
            on:click={onDeleteTempRepo}
          >
            Delete the temporary public repository now
          </Button>
        </div>
      {:else}
        <div
          class="text-xs text-green-400 p-1.5 border border-green-800/50 bg-green-900/10 rounded"
        >
          ✓ Temporary repository has been deleted
        </div>
      {/if}

      {#if !hasUsedTempRepoName}
        <div class="space-y-1">
          <p class="text-xs text-slate-300">2. Configure repository name:</p>
          <Button
            variant="outline"
            class="w-full text-xs py-1 h-7 border-slate-700 bg-slate-800 hover:bg-slate-700"
            on:click={onUseTempRepoName}
          >
            Use original repository name ({tempRepoData?.originalRepo})
          </Button>
        </div>
      {:else}
        <div
          class="text-xs text-green-400 p-1.5 border border-green-800/50 bg-green-900/10 rounded"
        >
          ✓ Repository name has been configured
        </div>
      {/if}

      <Button
        variant="ghost"
        class="w-full text-xs py-1 h-7 text-slate-400 hover:text-slate-300 hover:bg-slate-800"
        on:click={onDismiss}
      >
        Dismiss
      </Button>
    </div>

    <p class="text-xs text-slate-500 italic mt-1">
      Note: The temporary repository will be automatically deleted in 1 minute if not deleted
      manually.
    </p>
  </div>
</Modal>

<style>
  /* Customize Modal header */
  :global(.fixed > div > .bg-slate-900 > h2) {
    font-size: 1rem !important;
    margin-bottom: 0.5rem;
    color: #94a3b8;
    border-bottom: 1px solid #334155;
    padding-bottom: 0.5rem;
  }

  /* Customize Modal content */
  :global(.fixed > div > .bg-slate-900) {
    padding: 0.75rem !important;
    background-color: #1e293b;
    max-width: 400px;
  }
</style>
