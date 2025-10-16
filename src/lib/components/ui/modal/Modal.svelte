<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X } from 'lucide-svelte';

  export let show = false;
  export let title: string;

  const dispatch = createEventDispatcher();

  function handleClose() {
    dispatch('close');
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
    on:click={handleBackdropClick}
    on:keydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="bg-slate-900 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-slate-800">
      <div class="flex items-center justify-between mb-4">
        <h2 id="modal-title" class="text-xl font-semibold">{title}</h2>
        <button
          on:click={handleClose}
          class="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>
      </div>
      <div class="space-y-4">
        <slot />
      </div>
    </div>
  </div>
{/if}
