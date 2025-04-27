<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import FileChanges from '../../components/FileChanges.svelte';
  import type { FileChange } from '../../services/FilePreviewService';
  import { Upload } from 'lucide-svelte';

  export let show = false;
  export let fileChanges: Map<string, FileChange> | null = null;

  function handleClose() {
    show = false;
  }
  
  function pushToGitHub(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    // Send a message to trigger the GitHub push action
    chrome.runtime.sendMessage({ action: 'PUSH_TO_GITHUB' });
    show = false; // Close the modal after initiating the push
  }
</script>

<Modal {show} title="File Changes">
  <div class="space-y-2 h-[380px]">
    <div class="flex justify-between items-center mb-2 pb-2 border-b border-slate-700">
      <div class="flex flex-col">
        <h3 class="text-sm font-medium text-slate-300">Changes detected in your project</h3>
      </div>
      <div class="flex gap-2">
        <Button
          variant="default"
          size="sm"
          class="bg-blue-600 hover:bg-blue-700 text-xs py-1 h-7 flex items-center gap-1"
          on:click={pushToGitHub}
          on:keydown={(e) => e.key === 'Enter' && pushToGitHub(e)}
        >
          <Upload size={12} />
          Push
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs py-1 h-7"
          on:click={handleClose}
        >
          Close
        </Button>
      </div>
    </div>
    {#if fileChanges}
      <div class="h-[330px] overflow-y-auto rounded-md">
        <FileChanges changes={fileChanges} />
      </div>
    {:else}
      <div class="flex items-center justify-center h-[330px] bg-slate-800/50 rounded-md">
        <p class="text-slate-400 text-sm">No file changes to display</p>
      </div>
    {/if}
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
