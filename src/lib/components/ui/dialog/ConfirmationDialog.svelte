<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, Info } from 'lucide-svelte';

  export let show = false;
  export let title: string;
  export let message: string;
  export let confirmText = 'Confirm';
  export let cancelText = 'Cancel';
  export let type: 'warning' | 'info' | 'danger' = 'info';
  export let onConfirm: () => void = () => {};
  export let onCancel: () => void = () => {};

  function handleConfirm() {
    show = false;
    onConfirm();
  }

  function handleCancel() {
    show = false;
    onCancel();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Enter') {
      handleConfirm();
    }
  }

  // Icon and color based on type
  $: iconComponent = type === 'warning' || type === 'danger' ? AlertTriangle : Info;
  $: iconColor =
    type === 'danger' ? 'text-red-500' : type === 'warning' ? 'text-yellow-500' : 'text-blue-500';
  $: confirmButtonClass =
    type === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : type === 'warning'
        ? 'bg-yellow-600 hover:bg-yellow-700'
        : 'bg-blue-600 hover:bg-blue-700';
</script>

{#if show}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
    on:keydown={handleKeydown}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="bg-slate-900 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-slate-800"
      on:click|stopPropagation
    >
      <!-- Header with icon and title -->
      <div class="flex items-center gap-3 mb-4">
        <svelte:component this={iconComponent} class="h-6 w-6 {iconColor}" />
        <h2 class="text-lg font-semibold text-slate-200">{title}</h2>
      </div>

      <!-- Message content -->
      <div class="mb-6">
        <p class="text-slate-300 leading-relaxed">{message}</p>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3 justify-end">
        <Button
          variant="outline"
          size="sm"
          class="border-slate-700 bg-slate-800 hover:bg-slate-700"
          on:click={handleCancel}
        >
          {cancelText}
        </Button>
        <Button variant="default" size="sm" class={confirmButtonClass} on:click={handleConfirm}>
          {confirmText}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure the dialog is above other modals */
  .fixed {
    z-index: 60;
  }
</style>
