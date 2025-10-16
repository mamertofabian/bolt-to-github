<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, Info } from 'lucide-svelte';
  import {
    getIconComponent,
    getIconColor,
    getConfirmButtonClass,
    handleKeydown as handleKeydownUtil,
    handleConfirm as handleConfirmUtil,
    handleCancel as handleCancelUtil,
    type DialogType,
  } from './confirmation-dialog';

  export let show = false;
  export let title: string;
  export let message: string;
  export let confirmText = 'Confirm';
  export let cancelText = 'Cancel';
  export let type: DialogType = 'info';
  export let onConfirm: () => void = () => {};
  export let onCancel: () => void = () => {};

  function handleConfirm() {
    const result = handleConfirmUtil(onConfirm);
    show = result.show;
  }

  function handleCancel() {
    const result = handleCancelUtil(onCancel);
    show = result.show;
  }

  function handleKeydown(event: KeyboardEvent) {
    handleKeydownUtil(event, onConfirm, onCancel);
  }

  // Icon and color based on type using utility functions
  $: iconComponent = getIconComponent(type) === 'AlertTriangle' ? AlertTriangle : Info;
  $: iconColor = getIconColor(type);
  $: confirmButtonClass = getConfirmButtonClass(type);
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
        <p class="text-slate-300 leading-relaxed whitespace-pre-line">{message}</p>
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
