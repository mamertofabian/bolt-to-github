<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';
  import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    switchTab: string;
  }>();

  function handleConfigClick(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    dispatch('switchTab', 'settings');
  }
</script>

<div
  class="cursor-pointer"
  on:click|stopPropagation={handleConfigClick}
  on:keydown|stopPropagation={(e) => e.key === 'Enter' && handleConfigClick(e)}
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
