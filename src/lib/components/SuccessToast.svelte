<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Check, Mail } from 'lucide-svelte';

  export let message: string;
  export let showSubscribePrompt = false;
  export let hasSubscribed = false;
  export let show = false;
  export let duration = 5000; // Auto-hide after 5 seconds

  const dispatch = createEventDispatcher();

  let timeoutId: ReturnType<typeof setTimeout>;

  $: if (show) {
    // Clear existing timeout
    if (timeoutId) clearTimeout(timeoutId);

    // Set new timeout
    timeoutId = setTimeout(() => {
      show = false;
      dispatch('hide');
    }, duration);
  }

  function handleSubscribeClick() {
    dispatch('subscribe');
    show = false;
  }

  function hide() {
    show = false;
    dispatch('hide');
    if (timeoutId) clearTimeout(timeoutId);
  }
</script>

{#if show}
  <div class="fixed top-4 right-4 z-50 max-w-sm w-full mx-4 animate-in slide-in-from-right-4">
    <div class="bg-slate-900 border border-slate-800 rounded-lg shadow-lg p-4">
      <div class="flex items-start gap-3">
        <div class="bg-green-500/20 p-2 rounded-full flex-shrink-0">
          <Check class="h-4 w-4 text-green-500" />
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-medium text-slate-50 mb-1">{message}</h4>

          {#if showSubscribePrompt && !hasSubscribed}
            <div class="mt-3 space-y-2">
              <p class="text-xs text-slate-400">Want to stay updated with new features?</p>
              <div class="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  class="text-xs h-7 border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1"
                  on:click={handleSubscribeClick}
                >
                  <Mail class="h-3 w-3" />
                  Subscribe
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="text-xs h-7 text-slate-500 hover:text-slate-300"
                  on:click={hide}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          {:else}
            <button
              class="absolute top-2 right-2 text-slate-500 hover:text-slate-300 w-6 h-6 flex items-center justify-center rounded"
              on:click={hide}
              aria-label="Close notification"
            >
              ×
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-in-from-right-4 {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .animate-in {
    animation: slide-in-from-right-4 0.3s ease-out;
  }
</style>
